// The help centre (3.0.2): every topic in topics.ts has a text in every language, all languages have
// the same blocks (so steps and screenshots line up), and every screenshot exists for every language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import en from "./en";
import sv from "./sv";
import nb from "./nb";
import da from "./da";
import fi from "./fi";
import { TOPICS } from "./topics";
import type { Block } from "./types";

const ALL = { en, sv, nb, da, fi };
const PUBLIC = join(__dirname, "..", "..", "public", "help");

function shape(blocks: Block[]): unknown[] {
  return blocks.map((b) => {
    if ("steps" in b) return ["steps", b.steps.length];
    if ("tips" in b) return ["tips", b.tips.length];
    if ("shot" in b) return ["shot", b.shot];
    if ("details" in b) return ["details", b.details.map((d) => shape(d.blocks))];
    return [Object.keys(b)[0]];
  });
}

function shots(blocks: Block[]): string[] {
  return blocks.flatMap((b) => ("shot" in b ? [b.shot] : "details" in b ? b.details.flatMap((d) => shots(d.blocks)) : []));
}

test("every topic has a text, and every text a topic", () => {
  const ids = TOPICS.map((t) => t.id).sort();
  for (const [code, texts] of Object.entries(ALL)) assert.deepEqual(Object.keys(texts).sort(), ids, code);
});

test("every language has the same blocks as English", () => {
  for (const [code, texts] of Object.entries(ALL)) {
    for (const id of Object.keys(en)) assert.deepEqual(shape(texts[id].blocks), shape(en[id].blocks), `${code}:${id}`);
  }
});

test("no text is empty", () => {
  const empty: string[] = [];
  for (const [code, texts] of Object.entries(ALL)) {
    for (const [id, t] of Object.entries(texts)) {
      if (!t.title.trim() || !t.summary.trim()) empty.push(`${code}:${id}`);
    }
  }
  assert.deepEqual(empty, []);
});

test("every screenshot exists in every language", () => {
  const missing = Object.keys(ALL).flatMap((code) =>
    Object.values(en).flatMap((t) => shots(t.blocks)).filter((s) => !existsSync(join(PUBLIC, code, `${s}.webp`))).map((s) => `${code}/${s}`),
  );
  assert.deepEqual(missing, []);
});

test("related topics exist", () => {
  const ids = new Set(TOPICS.map((t) => t.id));
  const broken = TOPICS.flatMap((t) => (t.related ?? []).filter((r) => !ids.has(r)).map((r) => `${t.id}→${r}`));
  assert.deepEqual(broken, []);
});
