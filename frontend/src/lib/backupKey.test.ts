// The browser's backup keys against the server's format (services/backup_crypto.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BackupKeyError, keyFromText, keyId, keyToText, newKey, openSealed } from "./backupKey";

// Made by the server with the test key bytes 0..31 (never a real key).
const TEST_KEY = "SFKEY-AAAQE-AYEAU-DAOCA-JBIFQ-YDIOB-4IBCE-QTCQK-RMFYY-DENBW-HA5DY-PWGDI";
const SEALED = "U0ZFTkMx7t2IPaCpRRV/GQshuU0k1DjR2/z/tQu4atVsMPqYisXus+Ul9zJgMoVZzo0AAAAgf3xNWSTSNpb5nxBcnHpkUgJlxVIN7ZSXEoZFKXhV6YM=";
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

test("the key text is the server's, and typos are caught", async () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  assert.equal(await keyToText(key), TEST_KEY);
  assert.deepEqual(await keyFromText(TEST_KEY.toLowerCase().replace(/-/g, " ")), key);
  await assert.rejects(keyFromText(TEST_KEY.slice(0, -1) + "A"), BackupKeyError);
  await assert.rejects(keyFromText("SFKEY-ABC"), BackupKeyError);
});

test("a file sealed by the server opens here – and not with another key", async () => {
  const plain = await openSealed(bytes(SEALED), TEST_KEY);
  assert.equal(new TextDecoder().decode(plain), "SECRET_KEY=test\n");
  const other = await newKey();
  await assert.rejects(openSealed(bytes(SEALED), other.privateText), BackupKeyError);
  const broken = bytes(SEALED);
  broken[60] ^= 1;
  await assert.rejects(openSealed(broken, TEST_KEY), BackupKeyError);
});

test("a new key's text and public half belong together", async () => {
  const made = await newKey();
  assert.match(made.privateText, /^SFKEY(-[A-Z2-7]{5}){11}$/);
  assert.equal(made.keyId, await keyId(bytes(made.publicKey)));
  await keyFromText(made.privateText);
});
