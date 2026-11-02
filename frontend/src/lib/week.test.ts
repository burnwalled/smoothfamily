import test from "node:test";
import assert from "node:assert/strict";
import { getIsoWeek } from "./week";

test("ISO week around new year edges", () => {
  assert.equal(getIsoWeek(new Date("2020-12-29T12:00:00")), 53);
  assert.equal(getIsoWeek(new Date("2021-01-01T12:00:00")), 53);
  assert.equal(getIsoWeek(new Date("2021-01-04T12:00:00")), 1);
  assert.equal(getIsoWeek(new Date("2025-12-29T12:00:00")), 1);
});
