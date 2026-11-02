// One version everywhere (3.2.1): the newest "What's new" entry, package.json and the backend's
// __version__ (what the API reports) – bump all three in a release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LATEST_VERSION } from "./releaseNotes";

const root = join(__dirname, "..", "..");

test("package.json and the backend have the newest release's version", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  assert.equal(pkg.version, LATEST_VERSION);
  const backend = readFileSync(join(root, "..", "backend", "app", "__init__.py"), "utf8").match(/__version__ = "([^"]+)"/)?.[1];
  assert.equal(backend, LATEST_VERSION);
});
