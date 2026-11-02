// The little ones' mode (2.5.5): the picture cards and the ready-made routines. The pictures are
// emoji – drawn by the device itself, so nothing is fetched from elsewhere.
import type { TranslationKey } from "@/lib/i18n";

export type EasyStep = { id: string; picture: string; label: string; done: boolean };

export type EasyRoutine = {
  id: string;
  user_id: string;
  task_id: string;
  name: string;
  picture: string;
  weekdays: number[];
  points: number;
  requires_approval: boolean;
  steps: EasyStep[];
  // Today: none | pending (waiting for an adult) | approved
  state: "none" | "pending" | "approved";
};

export type EasyTask = { id: string; title: string; picture: string | null; state: "none" | "pending" | "approved" };

export type EasyDay = {
  user_id: string;
  name: string;
  color: string;
  routines: EasyRoutine[];
  tasks: EasyTask[];
  stickers: number;
  stickers_today: string[];
  new_sticker: string | null;
};

export type EasyChild = { id: string; display_name: string; color: string; easy_mode: boolean };

/** How the little ones' view reaches the server: as the child, an adult helping, or the kitchen display. */
export type EasyBackend = {
  load: () => Promise<EasyDay>;
  step: (id: string, undo: boolean) => Promise<EasyDay>;
  task: (id: string) => Promise<EasyDay>;
  stickers?: () => Promise<string[]>;
};

export const PICTURES: { picture: string; key: string }[] = [
  { picture: "🚽", key: "toilet" },
  { picture: "🧼", key: "washHands" },
  { picture: "🪥", key: "teeth" },
  { picture: "💇", key: "hair" },
  { picture: "👕", key: "dress" },
  { picture: "🧦", key: "socks" },
  { picture: "👖", key: "trousers" },
  { picture: "🥣", key: "breakfast" },
  { picture: "🍽️", key: "eat" },
  { picture: "💧", key: "drink" },
  { picture: "🎒", key: "bag" },
  { picture: "🥪", key: "lunchbox" },
  { picture: "🧥", key: "jacket" },
  { picture: "🧢", key: "hat" },
  { picture: "🧤", key: "gloves" },
  { picture: "👟", key: "shoes" },
  { picture: "🏫", key: "preschool" },
  { picture: "🧸", key: "toys" },
  { picture: "🍴", key: "table" },
  { picture: "🧺", key: "laundry" },
  { picture: "🐶", key: "pet" },
  { picture: "🪴", key: "plants" },
  { picture: "🛁", key: "bath" },
  { picture: "🚿", key: "shower" },
  { picture: "🌙", key: "pyjamas" },
  { picture: "📖", key: "book" },
  { picture: "🤗", key: "hug" },
  { picture: "🛏️", key: "bed" },
  { picture: "💊", key: "medicine" },
  { picture: "👓", key: "glasses" },
  { picture: "🌳", key: "outside" },
  { picture: "🎵", key: "music" },
  { picture: "🌅", key: "morning" },
  { picture: "⭐", key: "star" },
];

export const pictureLabel = (key: string) => `easy.pic.${key}` as TranslationKey;

export const TEMPLATES: { key: string; picture: string; steps: string[] }[] = [
  { key: "morning", picture: "🌅", steps: ["toilet", "teeth", "dress", "breakfast", "jacket", "shoes"] },
  { key: "evening", picture: "🌙", steps: ["toys", "bath", "pyjamas", "teeth", "toilet", "book", "bed"] },
  { key: "bag", picture: "🎒", steps: ["lunchbox", "drink", "socks", "hat", "gloves"] },
];

export const templateName = (key: string) => `easy.tpl.${key}` as TranslationKey;
