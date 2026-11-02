import { TranslationKey } from "@/lib/i18n";

// Named color choices for calendars and events (names are shown instead of hex codes).
export const COLORS = ["#4F7A5B", "#C2703D", "#3D6AC2", "#A03DC2", "#C23D5A", "#D98E2B"];
export const COLOR_NAMES: Record<string, TranslationKey> = {
  "#4F7A5B": "color.green",
  "#C2703D": "color.rust",
  "#3D6AC2": "color.blue",
  "#A03DC2": "color.purple",
  "#C23D5A": "color.red",
  "#D98E2B": "color.gold",
};
