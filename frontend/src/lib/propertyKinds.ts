// Homes (2.6.5): the kinds of home and the maintenance that usually comes back for each.
import type { TranslationKey } from "@/lib/i18n";

export type Dwelling = "villa" | "rowhouse" | "apartment" | "cabin" | "farm" | "other";
export type UpkeepKind = "maintenance" | "safety" | "inspection" | "season" | "insurance" | "warranty" | "other";

/** Every `months`, from today – or each year on a day (MM-DD). */
export type Upkeep = { key: string; kind: UpkeepKind; months: number; day?: string };

const smokeAlarm: Upkeep = { key: "smokeAlarm", kind: "safety", months: 12, day: "12-01" };
const floorDrain: Upkeep = { key: "floorDrain", kind: "maintenance", months: 6 };
const ventFilter: Upkeep = { key: "ventFilter", kind: "maintenance", months: 6 };
const gutters: Upkeep = { key: "gutters", kind: "maintenance", months: 12, day: "10-15" };
const outdoorTap: Upkeep = { key: "outdoorTap", kind: "season", months: 12, day: "10-01" };
const sweep: Upkeep = { key: "sweep", kind: "safety", months: 12 };
const fireCheck: Upkeep = { key: "fireCheck", kind: "inspection", months: 36 };
const heatPump: Upkeep = { key: "heatPump", kind: "maintenance", months: 12 };
const roof: Upkeep = { key: "roof", kind: "maintenance", months: 12, day: "04-15" };
const deck: Upkeep = { key: "deck", kind: "maintenance", months: 12, day: "05-15" };
const hoodFilter: Upkeep = { key: "hoodFilter", kind: "maintenance", months: 3 };
const insurance: Upkeep = { key: "insurance", kind: "insurance", months: 12 };

export const DWELLINGS: Record<Dwelling, { icon: string; upkeep: Upkeep[] }> = {
  villa: { icon: "🏡", upkeep: [smokeAlarm, sweep, fireCheck, gutters, roof, outdoorTap, ventFilter, heatPump, floorDrain, deck, insurance] },
  rowhouse: { icon: "🏘️", upkeep: [smokeAlarm, gutters, outdoorTap, ventFilter, floorDrain, hoodFilter, insurance] },
  apartment: { icon: "🏢", upkeep: [smokeAlarm, floorDrain, hoodFilter, insurance] },
  cabin: {
    icon: "🛖",
    upkeep: [smokeAlarm, { key: "openSeason", kind: "season", months: 12, day: "05-01" }, { key: "closeSeason", kind: "season", months: 12, day: "10-15" }, sweep, gutters, insurance],
  },
  farm: { icon: "🚜", upkeep: [smokeAlarm, sweep, fireCheck, gutters, roof, outdoorTap, ventFilter, heatPump, insurance] },
  other: { icon: "🏠", upkeep: [smokeAlarm, insurance] },
};

export const DWELLING_ORDER = Object.keys(DWELLINGS) as Dwelling[];
export const dwellingInfo = (d: string | null | undefined) => DWELLINGS[(d as Dwelling) ?? "villa"] ?? DWELLINGS.other;
export const dwellingLabel = (d: string) => `property.dwelling.${d}` as TranslationKey;
export const upkeepLabel = (key: string) => `property.upkeep.${key}` as TranslationKey;
