// #76: pages read through the cache (useApi in lib/query.ts) – not their own copies kept up to date
// by hand. This fails if one of the old ways comes back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

test("no page keeps its own copy of the server's data", () => {
  const offenders = files(join(__dirname, ".."))
    .filter((path) => /\bapi\s*\.live\b|\buseLive\(/.test(readFileSync(path, "utf-8")))
    .map((path) => path.slice(path.indexOf("src")));
  assert.deepEqual(offenders, []);
});
