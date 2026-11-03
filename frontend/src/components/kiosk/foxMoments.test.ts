// 3.4.0: the fox's moments fit the weather and the time of day, and the hare and the fish stay rare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { momentsOf } from "./foxMoments";

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
