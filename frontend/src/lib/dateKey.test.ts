import assert from "node:assert/strict";
import test from "node:test";

import { toLocalDateKey } from "./dateKey";

process.env.TZ = "Europe/Stockholm";

test("local date key uses local components around midnight", () => {
  const d = new Date("2026-06-13T00:30:00+02:00");
  assert.equal(toLocalDateKey(d), "2026-06-13");
  assert.equal(d.toISOString().slice(0, 10), "2026-06-12");
});

test("local date key stays correct at DST spring transition", () => {
  const d = new Date("2026-03-29T00:30:00+01:00");
  assert.equal(toLocalDateKey(d), "2026-03-29");
  assert.equal(d.toISOString().slice(0, 10), "2026-03-28");
});

test("local date key stays correct at DST autumn transition", () => {
  const d = new Date("2026-10-25T00:30:00+02:00");
  assert.equal(toLocalDateKey(d), "2026-10-25");
  assert.equal(d.toISOString().slice(0, 10), "2026-10-24");
});
