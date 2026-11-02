"""Token encryption using Fernet with a key derived from SECRET_KEY via HKDF-SHA256.

The encrypted token is stored at rest; the plaintext token never appears in
any API response.
"""
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings

_INFO = b"smooth-family-smarthome-token-encryption"


def _derive_key(secret: str) -> bytes:
    """Derive a 32-byte Fernet key from the app SECRET_KEY."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_INFO,
    )
    raw = hkdf.derive(secret.encode())
    return base64.urlsafe_b64encode(raw)


def encrypt_token(plaintext: str) -> str:
    key = _derive_key(get_settings().secret_key)
    f = Fernet(key)
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    key = _derive_key(get_settings().secret_key)
    f = Fernet(key)
    return f.decrypt(ciphertext.encode()).decode()
