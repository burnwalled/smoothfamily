// What the fox screensaver does now and then (3.4.0), apart from the scene so it can be tested.
import type { WeatherKind } from "@/lib/api";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type FoxActivity = "butterfly" | "kite" | "book" | "lantern" | "umbrella" | "thunder" | "snowman" | "sleep";
export type FoxMoment = "hop" | "splash" | "snowball" | "star" | "gust" | "hare" | "fish";

export const WET: WeatherKind[] = ["rain", "thunder", "sleet"];
export const GREY: WeatherKind[] = ["cloudy", "fog", "rain", "thunder", "sleet", "snow"];

// The moments that fit: the common ones listed more than once, so the hare and the fish stay rare.
export function momentsOf(activity: FoxActivity, kind: WeatherKind, season: Season, frozen: boolean): FoxMoment[] {
  if (activity === "sleep") return GREY.includes(kind) ? [] : ["star"];
  const out: FoxMoment[] = [];
  if (activity === "butterfly" || activity === "kite") out.push("hop", "hop", "hop");
  if (activity === "umbrella") out.push("splash", "splash", "splash");
  if (activity === "snowman") out.push("snowball", "snowball", "snowball");
  if (season === "autumn" && !WET.includes(kind) && kind !== "snow") out.push("gust", "gust");
  if (kind !== "thunder" && kind !== "fog" && !WET.includes(kind)) out.push("hare");
  if (!frozen && kind !== "thunder" && kind !== "fog") out.push("fish");
  return out;
}
