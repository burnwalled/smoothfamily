// Every language has exactly the English keys, the same {placeholders} and no empty texts, and
// every key is used somewhere in the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "./en";
import sv from "./sv";
import nb from "./nb";
import da from "./da";
import fi from "./fi";

const OTHERS = { sv, nb, da, fi };
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

for (const [code, dict] of Object.entries(OTHERS)) {
  test(`${code} has the same keys as English`, () => {
    const missing = Object.keys(en).filter((k) => !(k in dict));
    const extra = Object.keys(dict).filter((k) => !(k in en));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
  });

  test(`${code} keeps every placeholder`, () => {
    const wrong = Object.entries(en)
      .filter(([key, text]) => placeholders(text).join() !== placeholders(dict[key as keyof typeof en] ?? "").join())
      .map(([key]) => key);
    assert.deepEqual(wrong, []);
  });
}

test("no text is empty", () => {
  const empty = Object.entries({ en, ...OTHERS }).flatMap(([code, dict]) =>
    Object.entries(dict)
      .filter(([, text]) => !text.trim())
      .map(([key]) => `${code}:${key}`)
  );
  assert.deepEqual(empty, []);
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "locales" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

test("every English key is used in the app", () => {
  const code = sources(join(__dirname, "..")).map((f) => readFileSync(f, "utf8")).join("\n");
  // Keys built at runtime, e.g. t(`lists.category.${cat}`), count as used by their prefix.
  const prefixes = [...code.matchAll(/`([\w.]+\.)\$\{/g)].map((m) => m[1]);
  const unused = Object.keys(en).filter((key) => !code.includes(`"${key}"`) && !prefixes.some((p) => key.startsWith(p)));
  assert.deepEqual(unused, []);
});
