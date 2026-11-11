// 3.4.0: the fox's moments fit the weather and the time of day, and the hare and the fish stay rare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activitiesFor, momentsOf, pickActivity, type Day } from "./foxMoments";

const has = (list: string[], ...want: string[]) => want.every((w) => list.includes(w));

test("the moments fit the weather", () => {
  assert.ok(has(momentsOf("butterfly", "clear", "summer", false), "hop", "hare", "fish"));
  assert.ok(has(momentsOf("umbrella", "rain", "summer", false), "splash"));
  assert.ok(!momentsOf("umbrella", "rain", "summer", false).includes("hare"));
  assert.ok(has(momentsOf("snowman", "snow", "winter", true), "snowball", "hare"));
  assert.ok(!momentsOf("snowman", "snow", "winter", true).includes("fish"));
  assert.ok(has(momentsOf("book", "cloudy", "autumn", false), "gust"));
});

test("quiet in thunder and at night, but for a shooting star in a clear sky", () => {
  assert.deepEqual(momentsOf("thunder", "thunder", "summer", false), []);
  assert.deepEqual(momentsOf("sleep", "clear", "winter", false), ["star"]);
  assert.deepEqual(momentsOf("sleep", "cloudy", "winter", false), []);
});

test("the hare and the fish stay rare", () => {
  const sunny = momentsOf("butterfly", "clear", "summer", false);
  assert.ok(sunny.filter((m) => m === "hop").length > sunny.filter((m) => m === "hare").length);
});

// 3.4.1: the fox has more to do, and doesn't do the same thing every day.
const day = (over: Partial<Day> = {}): Day => ({ kind: "partly", phase: "day", season: "autumn", temp: 8, windy: false, snowy: false, frozen: false, ...over });

test("a partly cloudy day is not just the kite", () => {
  const choices = new Set(activitiesFor(day()));
  assert.ok(choices.size >= 5, [...choices].join(","));
  assert.ok(choices.has("kite") && choices.has("fishing") && choices.has("rake"));
  // Wind makes the kite likelier, not the only thing.
  const windy = activitiesFor(day({ windy: true }));
  assert.ok(windy.filter((a) => a === "kite").length > activitiesFor(day()).filter((a) => a === "kite").length);
});

test("the weather, the season and the time still decide", () => {
  assert.deepEqual(activitiesFor(day({ phase: "night" })), ["sleep"]);
  assert.deepEqual(activitiesFor(day({ kind: "thunder" })), ["thunder"]);
  assert.deepEqual(activitiesFor(day({ kind: "rain" })), ["umbrella"]);
  assert.ok(activitiesFor(day({ kind: "snow", season: "winter", snowy: true })).includes("sled"));
  assert.ok(activitiesFor(day({ kind: "clear", season: "summer", temp: 24 })).includes("icecream"));
  assert.ok(!activitiesFor(day({ kind: "clear", season: "winter", temp: -5, snowy: true, frozen: true })).includes("fishing"));
  assert.ok(activitiesFor(day({ phase: "dusk", kind: "clear" })).includes("telescope"));
  assert.ok(activitiesFor(day({ phase: "dusk", kind: "cloudy" })).includes("campfire"));
  assert.ok(!activitiesFor(day({ phase: "day", kind: "clear" })).includes("campfire"));
  assert.ok(activitiesFor(day({ phase: "dawn", kind: "clear" })).filter((a) => a === "mug").length >= 2);
  assert.ok(!activitiesFor(day({ season: "summer", kind: "clear", temp: 22 })).includes("rake"));
});

test("the choice holds for a part of the day and changes over the days", () => {
  const choices = activitiesFor(day());
  const morning = new Date(2026, 10, 11, 9, 5);
  assert.equal(pickActivity(choices, morning), pickActivity(choices, new Date(2026, 10, 11, 11, 50)));
  const seen = new Set<string>();
  for (let d = 1; d <= 30; d++) for (const h of [8, 11, 14]) seen.add(pickActivity(choices, new Date(2026, 10, d, h)));
  assert.ok(seen.size >= 4, [...seen].join(","));
  assert.equal(pickActivity([], morning), "butterfly");
});

test("the new things have moments of their own", () => {
  assert.ok(momentsOf("fishing", "partly", "autumn", false).filter((m) => m === "fish").length >= 3);
  assert.ok(has(momentsOf("campfire", "clear", "autumn", false), "star"));
  assert.ok(!momentsOf("campfire", "cloudy", "autumn", false).includes("star"));
  assert.ok(has(momentsOf("rake", "partly", "autumn", false), "gust"));
  assert.ok(has(momentsOf("sled", "snow", "winter", true), "snowball"));
});
