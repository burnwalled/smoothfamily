// Vehicles of every kind (2.6.0): what each counts on its meter, whether it has a registration,
// tyres or fuel, and the reminders that usually make sense for it.
import type { ReminderKind } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export type VehicleKind =
  | "car" | "motorcycle" | "moped" | "bicycle" | "ebike" | "boat" | "jetski" | "snowmobile" | "atv"
  | "tractor" | "mower" | "robot_mower" | "caravan" | "trailer" | "robot" | "other";
export type Meter = "km" | "hours" | "none";

/** A suggested reminder: every `months`, and/or every `step` on the meter, or each year on a day (MM-DD). */
export type Suggestion = { key: string; kind: ReminderKind; months?: number; step?: number; day?: string };

type Info = { icon: string; meter: Meter; registration: boolean; tyres: boolean; fuel: boolean; suggestions: Suggestion[] };

const insurance: Suggestion = { key: "insurance", kind: "insurance", months: 12 };
const winterStorage: Suggestion = { key: "winterStorage", kind: "storage", day: "10-15", months: 12 };

export const KINDS: Record<VehicleKind, Info> = {
  car: {
    icon: "🚗", meter: "km", registration: true, tyres: true, fuel: true,
    suggestions: [
      { key: "inspection", kind: "inspection", months: 14 },
      { key: "service", kind: "service", months: 12, step: 15000 },
      { key: "toWinterTyres", kind: "tyres", day: "10-15", months: 12 },
      { key: "toSummerTyres", kind: "tyres", day: "04-10", months: 12 },
      insurance,
      { key: "tax", kind: "tax", months: 12 },
    ],
  },
  motorcycle: {
    icon: "🏍️", meter: "km", registration: true, tyres: true, fuel: true,
    suggestions: [{ key: "inspection", kind: "inspection", months: 24 }, { key: "service", kind: "service", months: 12, step: 6000 }, winterStorage, { key: "springStart", kind: "storage", day: "04-01", months: 12 }, insurance],
  },
  moped: { icon: "🛵", meter: "km", registration: true, tyres: true, fuel: true, suggestions: [{ key: "service", kind: "service", months: 12 }, winterStorage, insurance] },
  bicycle: { icon: "🚲", meter: "none", registration: false, tyres: false, fuel: false, suggestions: [{ key: "service", kind: "service", day: "04-01", months: 12 }] },
  ebike: {
    icon: "🚲", meter: "km", registration: false, tyres: false, fuel: false,
    suggestions: [{ key: "service", kind: "service", months: 12, step: 3000 }, { key: "batteryWinter", kind: "battery", day: "11-01", months: 12 }, insurance],
  },
  boat: {
    icon: "🛥️", meter: "hours", registration: true, tyres: false, fuel: true,
    suggestions: [
      { key: "launch", kind: "storage", day: "05-01", months: 12 },
      { key: "haulOut", kind: "storage", day: "10-01", months: 12 },
      { key: "engineService", kind: "service", months: 12, step: 100 },
      { key: "impeller", kind: "other", months: 24 },
      insurance,
    ],
  },
  jetski: {
    icon: "🚤", meter: "hours", registration: true, tyres: false, fuel: true,
    suggestions: [{ key: "launch", kind: "storage", day: "05-15", months: 12 }, { key: "haulOut", kind: "storage", day: "09-15", months: 12 }, { key: "engineService", kind: "service", months: 12, step: 50 }, insurance],
  },
  snowmobile: {
    icon: "🛷", meter: "km", registration: true, tyres: false, fuel: true,
    suggestions: [{ key: "service", kind: "service", day: "11-01", months: 12 }, { key: "summerStorage", kind: "storage", day: "04-15", months: 12 }, insurance],
  },
  atv: { icon: "🛞", meter: "km", registration: true, tyres: true, fuel: true, suggestions: [{ key: "service", kind: "service", months: 12 }, insurance] },
  tractor: { icon: "🚜", meter: "hours", registration: true, tyres: true, fuel: true, suggestions: [{ key: "service", kind: "service", months: 12, step: 250 }, insurance] },
  mower: {
    icon: "🌿", meter: "hours", registration: false, tyres: false, fuel: true,
    suggestions: [{ key: "blade", kind: "other", day: "04-01", months: 12 }, { key: "service", kind: "service", months: 12, step: 50 }, winterStorage],
  },
  robot_mower: {
    icon: "🤖", meter: "hours", registration: false, tyres: false, fuel: false,
    suggestions: [{ key: "blades", kind: "other", months: 2 }, winterStorage, { key: "springStart", kind: "storage", day: "04-15", months: 12 }],
  },
  caravan: {
    icon: "🚐", meter: "none", registration: true, tyres: true, fuel: false,
    suggestions: [{ key: "inspection", kind: "inspection", months: 14 }, { key: "moisture", kind: "other", months: 12 }, insurance],
  },
  trailer: { icon: "🛻", meter: "none", registration: true, tyres: true, fuel: false, suggestions: [{ key: "inspection", kind: "inspection", months: 24 }, insurance] },
  robot: { icon: "🧹", meter: "none", registration: false, tyres: false, fuel: false, suggestions: [{ key: "filter", kind: "other", months: 3 }, { key: "brushes", kind: "other", months: 1 }] },
  other: { icon: "🔧", meter: "none", registration: false, tyres: false, fuel: false, suggestions: [{ key: "service", kind: "service", months: 12 }] },
};

export const KIND_ORDER = Object.keys(KINDS) as VehicleKind[];

export const kindInfo = (kind: string | undefined | null) => KINDS[(kind as VehicleKind) ?? "car"] ?? KINDS.other;
export const kindLabel = (kind: string) => `vehicles.type.${kind}` as TranslationKey;
export const suggestionLabel = (key: string) => `vehicles.sugg.${key}` as TranslationKey;

/** The next date a yearly day (MM-DD) falls on, from today. */
export function nextDay(day: string): string {
  const now = new Date();
  const [m, d] = day.split("-").map(Number);
  let year = now.getFullYear();
  const candidate = new Date(year, m - 1, d);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year += 1;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
