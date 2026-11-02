// Backup keys (2.9.0): made here in the browser so the private half never reaches the server, and
// used here to check that a key opens a sealed backup. The same format as the server's
// services/backup_crypto.py: X25519 + HKDF-SHA256 + AES-256-GCM in chunks.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAGIC = "SFENC1";
const HEADER = 6 + 8 + 32 + 4;
const INFO = new TextEncoder().encode("smooth-family backup v1");
// An X25519 private key in PKCS#8: this prefix and the 32 key bytes.
const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);

export class BackupKeyError extends Error {}

const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Whether this browser can make and use backup keys (X25519 in Web Crypto). */
export async function supported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

export async function keyId(publicKey: Uint8Array): Promise<string> {
  return hex((await sha256(publicKey)).slice(0, 8));
}

/** "SFKEY-XXXXX-…": the 32 key bytes and a 2-byte check, base32 in groups of five. */
export async function keyToText(key: Uint8Array): Promise<string> {
  const raw = concat(key, (await sha256(key)).slice(0, 2));
  let bits = Array.from(raw, (x) => x.toString(2).padStart(8, "0")).join("") + "000";
  let letters = "";
  for (let i = 0; i < 275; i += 5) letters += B32[parseInt(bits.slice(i, i + 5), 2)];
  bits = "";
  return "SFKEY-" + letters.match(/.{5}/g)!.join("-");
}

export async function keyFromText(text: string): Promise<Uint8Array> {
  let letters = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (letters.startsWith("SFKEY")) letters = letters.slice(5);
  if (letters.length !== 55 || [...letters].some((c) => !B32.includes(c))) throw new BackupKeyError("length");
  const bits = [...letters].map((c) => B32.indexOf(c).toString(2).padStart(5, "0")).join("");
  const raw = new Uint8Array(34);
  for (let i = 0; i < 34; i++) raw[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const key = raw.slice(0, 32);
  const check = (await sha256(key)).slice(0, 2);
  // The last letter's three spare bits are always 0: anything else is a typo too.
  if (bits.slice(272) !== "000" || check[0] !== raw[32] || check[1] !== raw[33]) throw new BackupKeyError("typo");
  return key;
}

async function importPrivate(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", concat(PKCS8_PREFIX, key) as BufferSource, { name: "X25519" }, true, ["deriveBits"]);
}

async function publicOf(privateKey: CryptoKey): Promise<Uint8Array> {
  // The public half from the private key's JWK (x is the public point).
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  const s = (jwk.x ?? "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

/** A new key pair: the private key as text (shown once) and the public half for the server. */
export async function newKey(): Promise<{ privateText: string; publicKey: string; keyId: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const priv = pkcs8.slice(pkcs8.length - 32);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateText: await keyToText(priv), publicKey: b64(pub), keyId: await keyId(pub) };
}

/** Opens a sealed file with the private key – the whole file, or only its first chunk (enough to
 * prove the key is right without fetching a large backup). Throws BackupKeyError otherwise. */
export async function openSealed(file: Uint8Array, privateText: string, firstChunkOnly = false): Promise<Uint8Array> {
  const priv = await keyFromText(privateText);
  if (file.length < HEADER || new TextDecoder().decode(file.slice(0, 6)) !== MAGIC) throw new BackupKeyError("not sealed");
  const header = file.slice(0, HEADER);
  const privateKey = await importPrivate(priv);
  const recipient = await publicOf(privateKey);
  if (hex(header.slice(6, 14)) !== (await keyId(recipient))) throw new BackupKeyError("another key");
  const eph = header.slice(14, 46);
  const prefix = header.slice(46, 50);
  const ephKey = await crypto.subtle.importKey("raw", eph as BufferSource, { name: "X25519" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "X25519", public: ephKey }, privateKey, 256));
  const hkdf = await crypto.subtle.importKey("raw", shared as BufferSource, "HKDF", false, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: concat(eph, recipient) as BufferSource, info: INFO as BufferSource }, hkdf, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const parts: Uint8Array[] = [];
  let at = HEADER;
  for (let n = 0; ; n++) {
    if (at + 4 > file.length) throw new BackupKeyError("cut short");
    const size = new DataView(file.buffer, file.byteOffset + at, 4).getUint32(0);
    const sealed = file.slice(at + 4, at + 4 + size);
    at += 4 + size;
    const nonce = concat(prefix, new Uint8Array(4), Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]));
    let plain: Uint8Array | null = null;
    let last = false;
    for (const flag of [0, 1]) {
      try {
        plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource, additionalData: concat(header, Uint8Array.of(flag)) as BufferSource }, aes, sealed as BufferSource));
        last = flag === 1;
        break;
      } catch {
        /* the other flag */
      }
    }
    if (!plain) throw new BackupKeyError("wrong key or damaged");
    parts.push(plain);
    if (last || firstChunkOnly) return concat(...parts);
  }
}
