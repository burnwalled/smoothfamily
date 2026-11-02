import test from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent } from "./api";
import { hourRange, placeTimed, weekBars } from "./calendarLayout";

const ev = (title: string, start: string, end: string, all_day = false): CalendarEvent => ({
  feed_id: null, event_id: title, feed_name: "", color: "#000", title, start, end, all_day, busy: false,
  location: null, description: null, created_by: null, member_ids: [],
});
const week = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

test("long events become bars across the days, in lanes", () => {
  const camp = ev("Camp", "2026-10-27T00:00:00Z", "2026-10-30T00:00:00Z", true); // Tue–Thu
  const dentist = ev("Dentist", "2026-10-27T14:50:00", "2026-10-27T15:50:00");
  const trip = ev("Trip", "2026-10-20T00:00:00Z", "2026-10-27T00:00:00Z", true); // ends Monday
  const { bars } = weekBars([dentist, camp, trip], week, 4);
  const by = Object.fromEntries(bars.map((b) => [b.event.title, b]));
  assert.deepEqual([by.Camp.col, by.Camp.span, by.Camp.lane], [1, 3, 0]);
  assert.deepEqual([by.Trip.col, by.Trip.span, by.Trip.fromBefore], [0, 1, true]);
  // The timed event goes under the bar that covers its day.
  assert.equal(by.Dentist.lane, 1);
});

test("what doesn't fit is counted per day", () => {
  const many = [1, 2, 3].map((n) => ev(`E${n}`, `2026-10-28T1${n}:00:00`, `2026-10-28T1${n}:30:00`));
  const { bars, more } = weekBars(many, week, 2);
  assert.equal(bars.length, 2);
  assert.deepEqual(more, [0, 0, 1, 0, 0, 0, 0]);
});

test("clashing events sit side by side", () => {
  const day = new Date(2026, 9, 27);
  const a = ev("A", "2026-10-27T14:50:00", "2026-10-27T15:50:00");
  const b = ev("B", "2026-10-27T14:50:00", "2026-10-27T15:50:00");
  const c = ev("C", "2026-10-27T17:00:00", "2026-10-27T18:00:00");
  const placed = placeTimed([a, b, c], day, 7, 22);
  const by = Object.fromEntries(placed.map((p) => [p.event.title, p]));
  assert.deepEqual([by.A.column, by.B.column, by.A.columns], [0, 1, 2]);
  assert.deepEqual([by.C.column, by.C.columns, by.C.top, by.C.height], [0, 1, 600, 60]);
});

test("the hours widen to fit", () => {
  assert.deepEqual(hourRange([ev("Early", "2026-10-27T05:30:00", "2026-10-27T06:00:00")]), [5, 22]);
  assert.deepEqual(hourRange([ev("Late", "2026-10-27T21:00:00", "2026-10-27T23:15:00")]), [7, 24]);
});
