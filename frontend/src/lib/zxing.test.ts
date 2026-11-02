// The barcode reader for browsers without one of their own (iPhone, iPad) is served from
// public/zxing so nothing is fetched from a CDN. After updating barcode-detector, copy the new
// node_modules/zxing-wasm/dist/reader/zxing_reader.wasm there – this test says when.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ZXING_WASM_SHA256 } from "zxing-wasm/reader";

test("the self-hosted zxing reader matches the installed package", () => {
  const ours = createHash("sha256").update(readFileSync("public/zxing/zxing_reader.wasm")).digest("hex");
  assert.equal(ours, ZXING_WASM_SHA256);
});
