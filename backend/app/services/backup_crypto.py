"""Backups sealed with a public key (2.9.0): the server can make them but never read them.

The key pair is made in the admin's browser; the server only gets the public key, and the private key
is shown once as a text to keep in a password manager or on paper ("SFKEY-…"). Each file gets its own
throw-away key pair: X25519 with the backup key, HKDF-SHA256, then AES-256-GCM in 1 MiB chunks, each
chunk authenticated and the last one marked – so a cut or changed file is noticed.

    header  = b"SFENC1" | key id (8) | ephemeral public key (32) | nonce prefix (4)
    chunk   = length (4, big endian) | AES-GCM(chunk, nonce = prefix | counter (8), aad = header | last)

The same format is read by the browser (lib/backupKey.ts) to check that a key opens a backup.
"""
import base64
import hashlib
import io
import os
import struct
from typing import BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MAGIC = b"SFENC1"
CHUNK = 1 << 20
INFO = b"smooth-family backup v1"
HEADER = len(MAGIC) + 8 + 32 + 4
SUFFIX = ".sfenc"
_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


class BackupKeyError(Exception):
    """A key that isn't one, or a file the key doesn't open."""


def key_id(public: bytes) -> bytes:
    return hashlib.sha256(public).digest()[:8]


def public_key_from_text(text: str) -> bytes:
    """The public key as the browser sends it: 32 bytes, base64."""
    try:
        raw = base64.b64decode(text.strip(), validate=True)
    except ValueError as exc:
        raise BackupKeyError("Not a backup key") from exc
    if len(raw) != 32:
        raise BackupKeyError("Not a backup key")
    return raw


def private_key_from_text(text: str) -> bytes:
    """"SFKEY-XXXX-XXXX-…": 32 key bytes and a 2-byte check, base32 – typos are caught."""
    letters = "".join(ch for ch in text.upper() if ch.isalnum())
    if letters.startswith("SFKEY"):
        letters = letters[5:]
    bits = "".join(f"{_B32.index(ch):05b}" for ch in letters if ch in _B32)
    if len(letters) != 55 or len(bits) != 275:
        raise BackupKeyError("The backup key should be 55 letters and digits after SFKEY")
    raw = int(bits[:272], 2).to_bytes(34, "big")
    key, check = raw[:32], raw[32:]
    # The last letter's three spare bits are always 0: anything else is a typo too.
    if bits[272:] != "000" or hashlib.sha256(key).digest()[:2] != check:
        raise BackupKeyError("The backup key has a typo")
    return key


def private_key_to_text(key: bytes) -> str:
    raw = key + hashlib.sha256(key).digest()[:2]
    bits = bin(int.from_bytes(raw, "big"))[2:].zfill(272) + "000"
    letters = "".join(_B32[int(bits[i:i + 5], 2)] for i in range(0, 275, 5))
    return "SFKEY-" + "-".join(letters[i:i + 5] for i in range(0, 55, 5))


def public_from_private(key: bytes) -> bytes:
    return X25519PrivateKey.from_private_bytes(key).public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def _derive(shared: bytes, ephemeral: bytes, recipient: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=ephemeral + recipient, info=INFO).derive(shared)


class SealWriter(io.RawIOBase):
    """A file to write into that comes out sealed: gzip and tar write through it."""

    def __init__(self, out: BinaryIO, public: bytes):
        super().__init__()
        self._out = out
        eph = X25519PrivateKey.generate()
        eph_pub = eph.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self._aead = AESGCM(_derive(eph.exchange(X25519PublicKey.from_public_bytes(public)), eph_pub, public))
        self._prefix = os.urandom(4)
        self._header = MAGIC + key_id(public) + eph_pub + self._prefix
        self._buf = bytearray()
        self._n = 0
        out.write(self._header)

    def writable(self) -> bool:
        return True

    def write(self, data) -> int:
        self._buf += data
        while len(self._buf) > CHUNK:
            self._chunk(bytes(self._buf[:CHUNK]), False)
            del self._buf[:CHUNK]
        return len(data)

    def _chunk(self, plain: bytes, last: bool) -> None:
        nonce = self._prefix + struct.pack(">Q", self._n)
        sealed = self._aead.encrypt(nonce, plain, self._header + (b"\x01" if last else b"\x00"))
        self._out.write(struct.pack(">I", len(sealed)) + sealed)
        self._n += 1

    def close(self) -> None:
        if not self.closed:
            self._chunk(bytes(self._buf), True)
            self._buf.clear()
            self._out.flush()
        super().close()


def seal_bytes(data: bytes, public: bytes) -> bytes:
    out = io.BytesIO()
    w = SealWriter(out, public)
    w.write(data)
    w.close()
    return out.getvalue()


def file_key_id(head: bytes) -> bytes | None:
    """Which key a sealed file needs (from its first bytes), or None for one that isn't sealed."""
    if len(head) < HEADER or not head.startswith(MAGIC):
        return None
    return head[len(MAGIC):len(MAGIC) + 8]


def unseal_stream(src: BinaryIO, dst: BinaryIO, private: bytes) -> None:
    header = src.read(HEADER)
    if len(header) != HEADER or not header.startswith(MAGIC):
        raise BackupKeyError("Not a sealed backup")
    public = public_from_private(private)
    if header[6:14] != key_id(public):
        raise BackupKeyError("The backup was sealed with another key")
    eph_pub, prefix = header[14:46], header[46:50]
    shared = X25519PrivateKey.from_private_bytes(private).exchange(X25519PublicKey.from_public_bytes(eph_pub))
    aead = AESGCM(_derive(shared, eph_pub, public))
    n = 0
    while True:
        size = src.read(4)
        if len(size) != 4:
            raise BackupKeyError("The backup is cut short")
        sealed = src.read(struct.unpack(">I", size)[0])
        nonce = prefix + struct.pack(">Q", n)
        for last in (False, True):
            try:
                plain = aead.decrypt(nonce, sealed, header + (b"\x01" if last else b"\x00"))
                break
            except InvalidTag:
                plain = None
        if plain is None:
            raise BackupKeyError("The backup is damaged or the key is wrong")
        dst.write(plain)
        n += 1
        if last:
            if src.read(1):
                raise BackupKeyError("The backup has extra data after its end")
            return


def unseal_bytes(data: bytes, private: bytes) -> bytes:
    out = io.BytesIO()
    unseal_stream(io.BytesIO(data), out, private)
    return out.getvalue()
