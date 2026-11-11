// What the fox screensaver does now and then (3.4.0), apart from the scene so it can be tested.
import type { WeatherKind } from "@/lib/api";

export type Season = "spring" | "summer" | "autumn" | "winter";
export type Phase = "dawn" | "day" | "dusk" | "night";
export type FoxActivity =
  | "butterfly" | "kite" | "book" | "lantern" | "umbrella" | "thunder" | "snowman" | "sleep"
  // 3.4.1: more to do – a few of these fit any day, and the fox picks a new one a few times a day.
  | "fishing" | "picnic" | "rake" | "campfire" | "telescope" | "sled" | "mug" | "guitar" | "watering" | "icecream" | "binoculars";
export type FoxMoment = "hop" | "splash" | "snowball" | "star" | "gust" | "hare" | "fish";

export type Day = { kind: WeatherKind; phase: Phase; season: Season; temp: number; windy: boolean; snowy: boolean; frozen: boolean };

/** Everything that fits this weather, season and time of day – a thing listed twice is twice as likely. */
export function activitiesFor({ kind, phase, season, temp, windy, snowy, frozen }: Day): FoxActivity[] {
  if (phase === "night") return ["sleep"];
  if (kind === "thunder") return ["thunder"];
  if (kind === "rain" || kind === "sleet") return ["umbrella"];
  if (kind === "fog") return ["lantern", "lantern", "mug"];
  if (kind === "snow") return ["snowman", "snowman", "sled", "mug"];
  const out: FoxActivity[] = [];
  const dry = kind === "clear" || kind === "partly";
  const warm = season !== "winter" && temp >= 12;
  const growing = season === "spring" || season === "summer";
  if (dry) out.push("butterfly", "kite", "binoculars", "guitar");
  if (kind === "partly" || windy) out.push("kite");
  if (windy) out.push("kite");
  if (kind === "cloudy") out.push("book", "book", "mug", "guitar", "binoculars");
  if (!frozen) out.push("fishing");
  if (dry && warm) out.push("picnic");
  if (dry && temp >= 20) out.push("icecream", "icecream");
  if (growing && !snowy) out.push("watering");
  if (season === "autumn" && !snowy) out.push("rake", "rake");
  if (snowy) out.push("sled", "sled");
  if (phase === "dawn") out.push("mug", "mug");
  if (phase === "dusk") {
    out.push("campfire", "campfire");
    if (dry) out.push("telescope", "telescope");
  }
  return out;
}

/** The same choice all through a part of the day, another one next – so the kiosk doesn't flicker
 *  between things, and the fox still isn't at the same thing every day. */
export function pickActivity(choices: FoxActivity[], now: Date): FoxActivity {
  if (choices.length === 0) return "butterfly";
  const slot = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${Math.floor(now.getHours() / 3)}`;
  let h = 7;
  for (const c of slot) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return choices[h % choices.length];
}

export const WET: WeatherKind[] = ["rain", "thunder", "sleet"];
export const GREY: WeatherKind[] = ["cloudy", "fog", "rain", "thunder", "sleet", "snow"];

// The moments that fit: the common ones listed more than once, so the hare and the fish stay rare.
export function momentsOf(activity: FoxActivity, kind: WeatherKind, season: Season, frozen: boolean): FoxMoment[] {
  if (activity === "sleep") return GREY.includes(kind) ? [] : ["star"];
  const out: FoxMoment[] = [];
  if (activity === "butterfly" || activity === "kite" || activity === "picnic" || activity === "icecream") out.push("hop", "hop", "hop");
  if (activity === "umbrella") out.push("splash", "splash", "splash");
  if (activity === "snowman" || activity === "sled") out.push("snowball", "snowball", "snowball");
  if ((activity === "campfire" || activity === "telescope") && !GREY.includes(kind)) out.push("star", "star");
  if (season === "autumn" && !WET.includes(kind) && kind !== "snow") out.push("gust", "gust");
  if (activity === "rake") out.push("gust", "gust");
  if (kind !== "thunder" && kind !== "fog" && !WET.includes(kind)) out.push("hare");
  if (!frozen && kind !== "thunder" && kind !== "fog") out.push("fish");
  if (activity === "fishing" && !frozen) out.push("fish", "fish", "fish");
  return out;
}
