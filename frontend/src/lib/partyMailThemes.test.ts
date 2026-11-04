import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The server's mails use the app's themes from a file of its own: this keeps them in step.
test("the mails know every theme, in its own accent colour", () => {
  const source = readFileSync("src/lib/partyThemes.ts", "utf8");
  const mails = JSON.parse(readFileSync("../backend/app/services/party_mail_themes.json", "utf8")) as Record<string, { accent: string; ink: string; font: string }>;
  const themes = [...source.matchAll(/^\s*T\("(\w+)",\s*"\w+",\s*\{([^\n]*)\}\),?\s*$/gm)];
  assert.ok(themes.length > 20);
  for (const [, key, body] of themes) {
    assert.ok(mails[key], `${key} is missing: scripts/party-mail-themes.py`);
    assert.equal(mails[key].accent, /[ ,]accent: "(#[0-9a-fA-F]{6})"/.exec(body)?.[1], key);
    assert.equal(mails[key].ink, /[ ,]ink: "(#[0-9a-fA-F]{6})"/.exec(body)?.[1], key);
    assert.equal(mails[key].font, /fonts: "(\w+)"/.exec(body)?.[1], key);
  }
  assert.equal(Object.keys(mails).length, themes.length);
});
