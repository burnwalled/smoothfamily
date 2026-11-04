// The looks a party's page can wear (3.4.0) – the invitation and, separately, the thank-you – by
// the kind of party they suit, and the family's own. Each is a whole poster: a background with a
// pattern, a palette for the cards (light or dark), a pair of typefaces, the decoration's emoji and
// a moving effect (confetti, gold bokeh, stars, bubbles, snow, leaves, embers).
import type { CSSProperties } from "react";
import { FONTS, FontSet } from "@/lib/partyFonts";
import { libraryUrl, themePicture } from "@/lib/partyLibrary";

export type PatternKey = "none" | "confetti" | "dots" | "stars" | "stripes" | "hearts" | "check";
export type Effect = "none" | "confetti" | "bokeh" | "stars" | "bubbles" | "snow" | "leaves" | "embers";
export const EFFECTS: Effect[] = ["none", "confetti", "bokeh", "stars", "bubbles", "snow", "leaves", "embers"];
export type ThemeCategory = "kids" | "party" | "dinner" | "sports" | "outdoor";
export type PartyTheme = {
  key: string;
  category: ThemeCategory | "custom";
  dark: boolean;
  background: string;
  pattern: PatternKey;
  patternColor: string;
  band: string;
  // The cards, the text and the gold of the title (accentHi → accent → accentLo).
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentHi: string;
  accentLo: string;
  line: string;
  decor: string[];
  fonts: FontSet;
  effect: Effect;
  // The colours the effect is drawn in.
  sparks: string[];
  // Stickers from the picture library that suit it (in place of emoji on its poster).
  stickers: string[];
  image?: string;
  header?: string;
};

// An own theme as the server keeps it.
export type CustomTheme = {
  id: string; name: string; bg: string; bg2: string; accent: string; ink: string; pattern: PatternKey; decor: string;
  font?: FontSet; effect?: Effect; header: string | null; background: string | null;
};

export const CATEGORIES: ThemeCategory[] = ["kids", "party", "dinner", "sports", "outdoor"];

const emoji = (s: string) => Array.from(new Intl.Segmenter().segment(s), (x) => x.segment).filter((x) => x.trim());

type Def = Omit<PartyTheme, "key" | "category" | "decor" | "band" | "sparks" | "patternColor" | "stickers"> & { decor: string; band?: string; sparks?: string[]; patternColor?: string };
const T = (key: string, category: ThemeCategory, d: Def): PartyTheme => ({
  ...d, key, category, decor: emoji(d.decor),
  band: d.band ?? `linear-gradient(90deg,${d.accentLo},${d.accentHi},${d.accent},${d.accentLo})`,
  sparks: d.sparks ?? [d.accentHi, d.accent, d.accentLo],
  patternColor: d.patternColor ?? d.accent,
  stickers: [],
});

const LIGHT = { dark: false, surface: "rgba(255,255,255,.86)" };
const DARK = { dark: true };

export const PARTY_THEMES: PartyTheme[] = [
  // A child's party
  T("balloons", "kids", { ...LIGHT, fonts: "playful", effect: "confetti", pattern: "confetti", background: "radial-gradient(ellipse at 15% 0%,#ffd1dc 0%,transparent 55%),radial-gradient(ellipse at 95% 15%,#cfe3ff 0%,transparent 50%),linear-gradient(180deg,#fff4e6,#fffaf5)", ink: "#3b2430", muted: "#7a5a66", accent: "#e0436a", accentHi: "#ff8fab", accentLo: "#b02a50", line: "#f3c1cf", decor: "🎈🎉🎂🎁🎈", sparks: ["#e0436a", "#f2b632", "#3f6fb5", "#7ee08a", "#b48cff"] }),
  T("jungle", "kids", { ...DARK, surface: "rgba(18,46,26,.88)", fonts: "playful", effect: "leaves", pattern: "dots", background: "radial-gradient(ellipse at 50% 0%,#3f7a3a 0%,#1f4d2b 45%,#10291a 100%)", ink: "#f7f3dc", muted: "#c9d3ad", accent: "#f2c14e", accentHi: "#ffe08a", accentLo: "#b5862a", line: "#3f6b44", decor: "🦁🌴🐒🦜🐘🐍", sparks: ["#7aa83f", "#a8d26b", "#f2c14e", "#4e8a2f"] }),
  T("space", "kids", { ...DARK, surface: "rgba(16,20,52,.86)", fonts: "playful", effect: "stars", pattern: "stars", patternColor: "#ffffff", background: "radial-gradient(ellipse at 75% 5%,#4b3fa8 0%,#1d2257 40%,#05070f 100%)", ink: "#eef0ff", muted: "#aeb3e0", accent: "#8b7bff", accentHi: "#d4ccff", accentLo: "#5a4bd1", line: "#2f3670", decor: "🚀🪐⭐👩‍🚀🌙🛸", sparks: ["#ffffff", "#c7bdff", "#7fd6ff", "#f6d55c"] }),
  T("ocean", "kids", { ...LIGHT, fonts: "playful", effect: "bubbles", pattern: "dots", patternColor: "#ffffff", background: "linear-gradient(180deg,#bfeaf8 0%,#e9f9ff 45%,#8fd1e8 100%)", ink: "#0f3550", muted: "#47708a", accent: "#0b84b8", accentHi: "#5cc8f0", accentLo: "#075e85", line: "#a8d9ec", decor: "🐳🐠🐚🌊🐙🦀", sparks: ["#ffffff", "#bfeaf8", "#5cc8f0"] }),
  T("fairytale", "kids", { ...LIGHT, fonts: "classic", effect: "stars", pattern: "stars", patternColor: "#c9a227", background: "radial-gradient(ellipse at 50% 0%,#f1dcff 0%,#fff0fb 55%,#ffe7f1 100%)", ink: "#3a2647", muted: "#7b5f8c", accent: "#9c6ad8", accentHi: "#d6b8ff", accentLo: "#6c3fb0", line: "#e3cdf5", decor: "🏰👑✨🧚🐉🌹", sparks: ["#c9a227", "#f6d55c", "#d6b8ff", "#f28fb1"] }),
  T("pirate", "kids", { ...DARK, surface: "rgba(14,34,51,.88)", fonts: "playful", effect: "bokeh", pattern: "stripes", patternColor: "#c9a46a", background: "linear-gradient(180deg,#0e2233 0%,#173a52 55%,#8a6a3f 100%)", ink: "#fbeed3", muted: "#d2c09c", accent: "#e0b250", accentHi: "#ffd98a", accentLo: "#9a7328", line: "#3d5a70", decor: "🏴‍☠️🦜⚓🗺️💰⚔️" }),
  T("dinosaur", "kids", { ...LIGHT, fonts: "playful", effect: "leaves", pattern: "dots", patternColor: "#7aa83f", background: "linear-gradient(165deg,#d9f2b4 0%,#fff3d1 55%,#ffd6a6 100%)", ink: "#2c2410", muted: "#6b5f3a", accent: "#e06d1f", accentHi: "#ffa95c", accentLo: "#a84a0e", line: "#e8d7a8", decor: "🦖🦕🌋🥚🌿🦴", sparks: ["#7aa83f", "#4e8a2f", "#f29f3d"] }),
  T("superhero", "kids", { ...LIGHT, fonts: "retro", effect: "stars", pattern: "stars", patternColor: "#f1c40f", background: "radial-gradient(circle at 50% 30%,#fff7c2 0%,#ffd6d6 50%,#c9d7ff 100%)", ink: "#1a1f3d", muted: "#4b5077", accent: "#d32f2f", accentHi: "#ff6b5e", accentLo: "#8e1414", line: "#f0c6c6", decor: "🦸💥⚡🦹🛡️🌟", sparks: ["#d32f2f", "#f1c40f", "#1e4fd8"] }),
  T("unicorn", "kids", { ...LIGHT, fonts: "playful", effect: "stars", pattern: "stars", patternColor: "#ff8fd0", background: "linear-gradient(135deg,#ffd6f0 0%,#e6dcff 35%,#d4f4ff 70%,#fff4c9 100%)", ink: "#4a2550", muted: "#80608a", accent: "#d14ea3", accentHi: "#ff9fd6", accentLo: "#9a2a72", line: "#f2c9e6", decor: "🦄🌈⭐🍭💖☁️", sparks: ["#ff8fd0", "#b49bff", "#7fd6ff", "#ffe27a"] }),
  // A party
  T("disco", "party", { ...DARK, surface: "rgba(30,6,52,.86)", fonts: "retro", effect: "bokeh", pattern: "stars", patternColor: "#ffd7ff", background: "radial-gradient(ellipse at 50% -10%,#b03cff 0%,#4b0f8a 40%,#12002a 100%)", ink: "#fff3ff", muted: "#d8b9e8", accent: "#ff3cc7", accentHi: "#ffc2f1", accentLo: "#a3157f", line: "#5b2a7d", decor: "🪩🕺💃✨🎶🪩", sparks: ["#ff3cc7", "#ffd700", "#00e5ff", "#ffffff"] }),
  T("glitter", "party", { ...LIGHT, fonts: "gala", effect: "confetti", pattern: "confetti", patternColor: "#d4a017", background: "linear-gradient(135deg,#fff2d6 0%,#ffd9e5 40%,#f7e1ff 70%,#fff4c2 100%)", ink: "#3d2a08", muted: "#7a6435", accent: "#c08a10", accentHi: "#f5d27a", accentLo: "#8a6206", line: "#ecd6a2", decor: "✨💫🎉🥳🎊✨", sparks: ["#d4a017", "#f5d27a", "#f7c6d9", "#ffffff"] }),
  T("eighties", "party", { ...DARK, surface: "rgba(34,8,58,.86)", fonts: "retro", effect: "stars", pattern: "stripes", patternColor: "#00e5ff", background: "linear-gradient(180deg,#1a0636 0%,#5b1a6e 40%,#ff5e8a 78%,#ffb36b 100%)", ink: "#fff6ff", muted: "#e9c3e8", accent: "#00e5ff", accentHi: "#a8f7ff", accentLo: "#0090a8", line: "#7b3a8a", decor: "📼🕹️🎧💾🌴🛼", sparks: ["#00e5ff", "#ff2bd6", "#ffe600"] }),
  T("nineties", "party", { ...LIGHT, fonts: "retro", effect: "confetti", pattern: "confetti", patternColor: "#7b2ff7", background: "linear-gradient(135deg,#c2fff4 0%,#fff6c2 40%,#ffd1f2 75%,#d6d1ff 100%)", ink: "#1c1440", muted: "#4d4570", accent: "#7b2ff7", accentHi: "#b98cff", accentLo: "#4f12b8", line: "#d9cdf7", decor: "💿📟🛹🎮🍕😎", sparks: ["#14b8a6", "#7b2ff7", "#ff4d9d", "#ffd600"] }),
  T("glamour", "party", { ...DARK, surface: "rgba(23,19,13,.9)", fonts: "gala", effect: "bokeh", pattern: "none", background: "radial-gradient(ellipse at 50% 0%,#2a2214 0%,#110e09 55%,#0d0b08 100%)", ink: "#f3ead8", muted: "#b9ab8e", accent: "#d9a94a", accentHi: "#f6dc96", accentLo: "#8a6424", line: "#8a6424", decor: "💎🥂✨🌟💋", sparks: ["#f6dc96", "#d9a94a", "#b88a37", "#fff1c4"] }),
  T("techno", "party", { ...DARK, surface: "rgba(4,16,11,.9)", fonts: "sporty", effect: "stars", pattern: "stripes", patternColor: "#00ff9d", background: "linear-gradient(180deg,#000000 0%,#061a12 55%,#002b1c 100%)", ink: "#e6fff5", muted: "#8fcfb4", accent: "#00ff9d", accentHi: "#b8ffe2", accentLo: "#00a866", line: "#0f4a33", decor: "🎛️🔊⚡🎧🌀💚", sparks: ["#00ff9d", "#00b3ff", "#c200ff"] }),
  T("champagne", "party", { ...LIGHT, fonts: "gala", effect: "bubbles", pattern: "dots", patternColor: "#ffffff", background: "linear-gradient(170deg,#fff8ea 0%,#f6e6c4 55%,#e8cc8e 100%)", ink: "#3a2a12", muted: "#7a6440", accent: "#a67c3d", accentHi: "#e8c98a", accentLo: "#6e4f1e", line: "#e5d1a6", decor: "🍾🥂✨🥂🍾🎇", sparks: ["#ffffff", "#fff1c4", "#e8c98a"] }),
  T("neon", "party", { ...DARK, surface: "rgba(13,2,33,.88)", fonts: "retro", effect: "bokeh", pattern: "dots", patternColor: "#ff3cac", background: "radial-gradient(ellipse at 20% 20%,#2a0845 0%,#0d0221 60%,#05010f 100%)", ink: "#f3e9ff", muted: "#b9a6d6", accent: "#ff3cac", accentHi: "#ffb3dc", accentLo: "#b0136f", line: "#3d1d66", decor: "💜💚⚡🌃✨🍸", sparks: ["#ff3cac", "#784ba0", "#2b86c5", "#00f5d4"] }),
  T("student", "party", { ...DARK, surface: "rgba(8,40,84,.88)", fonts: "gala", effect: "confetti", pattern: "none", background: "linear-gradient(180deg,#0b5fb4 0%,#0a3d78 55%,#06244a 100%)", ink: "#ffffff", muted: "#cfe0f5", accent: "#ffd23f", accentHi: "#fff0a8", accentLo: "#c99a00", line: "#2d5f9a", decor: "🎓📜🥂🎉", sparks: ["#ffd23f", "#ffffff", "#4fa3ff"] }),
  T("halloween", "party", { ...DARK, surface: "rgba(18,8,36,.9)", fonts: "retro", effect: "embers", pattern: "none", background: "radial-gradient(ellipse at 50% 0%,#3b1a63 0%,#160a2e 55%,#05010f 100%)", ink: "#fff3e0", muted: "#cdb8e0", accent: "#ff8a1f", accentHi: "#ffc27a", accentLo: "#b85600", line: "#3d2466", decor: "🎃👻🦇🕸️🍬", sparks: ["#ff8a1f", "#a259ff", "#ffd27a"] }),
  T("newyear", "party", { ...DARK, surface: "rgba(4,8,30,.9)", fonts: "gala", effect: "stars", pattern: "none", background: "radial-gradient(ellipse at 50% 0%,#1d2a6b 0%,#0a1033 55%,#02040f 100%)", ink: "#f4f2ff", muted: "#b9bde0", accent: "#e8c45c", accentHi: "#fff0b8", accentLo: "#9c7a1e", line: "#2a3570", decor: "🎆🥂🕛✨🎇", sparks: ["#fff0b8", "#e8c45c", "#9fc3ff", "#ffffff"] }),
  // A dinner
  T("wedding", "dinner", { ...LIGHT, surface: "rgba(255,253,250,.9)", fonts: "classic", effect: "leaves", pattern: "none", background: "linear-gradient(180deg,#fbf7f2 0%,#f3ece3 100%)", ink: "#3a2f28", muted: "#7a6b5e", accent: "#a8875a", accentHi: "#dcc29a", accentLo: "#6f5634", line: "#e6dccf", decor: "💍🤍🌿🥂💐", sparks: ["#ffffff", "#f3d9df", "#dcc29a", "#c9d8c0"] }),
  T("elegant", "dinner", { ...LIGHT, surface: "rgba(255,253,248,.9)", fonts: "classic", effect: "bokeh", pattern: "none", background: "radial-gradient(ellipse at 50% 0%,#fbf7ef 0%,#f3ece0 60%,#e9dfcc 100%)", ink: "#2b2620", muted: "#6e6354", accent: "#8a6a3a", accentHi: "#cfae73", accentLo: "#5c4422", line: "#e0d3bb", decor: "🥂🕯️🍽️🕯️🥂", sparks: ["#e6d3a8", "#cfae73", "#ffffff"] }),
  T("bistro", "dinner", { ...LIGHT, surface: "rgba(255,251,245,.92)", fonts: "classic", effect: "none", pattern: "check", patternColor: "#c0392b", background: "linear-gradient(180deg,#fff9f2,#fbefe4)", ink: "#2a1410", muted: "#6b4a40", accent: "#9e2121", accentHi: "#d45a4a", accentLo: "#6b1111", line: "#ecd2c4", decor: "🍷🥖🧀🍝🕯️" }),
  T("christmas", "dinner", { ...DARK, surface: "rgba(10,40,26,.9)", fonts: "classic", effect: "snow", pattern: "stars", patternColor: "#ffffff", background: "radial-gradient(ellipse at 50% 0%,#1d5e3c 0%,#0f3d2a 50%,#0a2619 100%)", ink: "#fff7ed", muted: "#d6c7a8", accent: "#e3b04b", accentHi: "#ffe0a0", accentLo: "#a37a26", line: "#2c5e44", decor: "🎄🎅⭐🎁❄️🕯️", sparks: ["#ffffff", "#f5f5f5", "#e8f0ff"] }),
  T("midsummer", "dinner", { ...LIGHT, fonts: "classic", effect: "leaves", pattern: "confetti", patternColor: "#f2c12e", background: "linear-gradient(170deg,#fffbd1 0%,#eaf7d4 55%,#cfeec0 100%)", ink: "#1e3320", muted: "#55704f", accent: "#2b6cb0", accentHi: "#7fb0e6", accentLo: "#1b4a80", line: "#d5e8c0", decor: "🌼💐🍓🌿🥂☀️", sparks: ["#f6e05e", "#ffffff", "#f28fb1", "#7aa83f"] }),
  T("crayfish", "dinner", { ...DARK, surface: "rgba(14,24,56,.9)", fonts: "classic", effect: "bokeh", pattern: "dots", patternColor: "#fca5a5", background: "radial-gradient(ellipse at 50% 0%,#2a3f8a 0%,#14224d 50%,#0a1230 100%)", ink: "#fff7ed", muted: "#c9cbe0", accent: "#ff5a4a", accentHi: "#ffb199", accentLo: "#b8241a", line: "#2f3f78", decor: "🦞🌕🍻🎏🦐🍋", sparks: ["#ff5a4a", "#fde047", "#ffffff"] }),
  T("garden", "dinner", { ...LIGHT, fonts: "classic", effect: "leaves", pattern: "hearts", patternColor: "#f2a7bf", background: "linear-gradient(180deg,#fdf3df 0%,#f1f9e8 55%,#fde5ec 100%)", ink: "#33281f", muted: "#6e6051", accent: "#d9658a", accentHi: "#f5a9c2", accentLo: "#a33c60", line: "#eed9cf", decor: "🌸🌼🦋🌷🌻", sparks: ["#f5a9c2", "#f6d55c", "#9cc96b"] }),
  // A match
  T("football", "sports", { ...DARK, surface: "rgba(12,48,22,.9)", fonts: "sporty", effect: "confetti", pattern: "stripes", patternColor: "#ffffff", background: "repeating-linear-gradient(90deg,#2f8f3a 0 80px,#37a142 80px 160px)", ink: "#ffffff", muted: "#cfe8d2", accent: "#ffd60a", accentHi: "#fff2a8", accentLo: "#b8960a", line: "#3f8f4a", decor: "⚽🏟️🥅🏆📣🧣", sparks: ["#ffffff", "#ffd60a", "#1b1b1b"] }),
  T("hockey", "sports", { ...LIGHT, fonts: "sporty", effect: "snow", pattern: "stripes", patternColor: "#b3d8f2", background: "linear-gradient(180deg,#eaf6ff 0%,#ffffff 50%,#d6ecfb 100%)", ink: "#0d2236", muted: "#4a6176", accent: "#1565c0", accentHi: "#64a6f0", accentLo: "#0d3f7a", line: "#c7ddf0", decor: "🏒🥅🧊🏆📣🧣", sparks: ["#ffffff", "#b3d8f2", "#e3f2ff"] }),
  T("sports", "sports", { ...LIGHT, fonts: "sporty", effect: "confetti", pattern: "confetti", patternColor: "#2e8b57", background: "linear-gradient(180deg,#eaf7ec 0%,#f7fbf6 60%,#eef3fb 100%)", ink: "#1d2b22", muted: "#4f6356", accent: "#2e8b57", accentHi: "#79c79a", accentLo: "#1d5c38", line: "#cfe5d6", decor: "🏆🥇⚽🏀🎾" }),
  // Outdoors
  T("bbq", "outdoor", { ...DARK, surface: "rgba(36,16,6,.9)", fonts: "sporty", effect: "embers", pattern: "none", background: "radial-gradient(ellipse at 50% 110%,#f28c28 0%,#6b2a0e 45%,#1e0d05 100%)", ink: "#fff4e6", muted: "#e0bfa0", accent: "#ff7a1a", accentHi: "#ffc07a", accentLo: "#b84a00", line: "#5c2a12", decor: "🔥🍖🌭🌽🍻🥩", sparks: ["#ffb347", "#ff7a1a", "#ffd000"] }),
  T("brannboll", "outdoor", { ...LIGHT, fonts: "playful", effect: "confetti", pattern: "confetti", patternColor: "#f6c344", background: "linear-gradient(180deg,#bfe6ff 0%,#e8f7ff 45%,#9ad46b 100%)", ink: "#163020", muted: "#4a6450", accent: "#2f855a", accentHi: "#7ccc9c", accentLo: "#1d5a3b", line: "#cde6d3", decor: "🏏⚾☀️🏃🍦🌳", sparks: ["#2b6cb0", "#f6e05e", "#48bb78"] }),
  T("beach", "outdoor", { ...LIGHT, fonts: "playful", effect: "bubbles", pattern: "dots", patternColor: "#ffffff", background: "linear-gradient(180deg,#7fd3f5 0%,#bfeaf9 45%,#fbe3a6 75%,#f5cf7a 100%)", ink: "#10324a", muted: "#4a6a80", accent: "#0089b8", accentHi: "#5fd0f5", accentLo: "#005f80", line: "#bfe0ec", decor: "🏖️🌊☀️🍉🩱🐚", sparks: ["#ffffff", "#bfeaf9"] }),
  T("picnic", "outdoor", { ...LIGHT, surface: "rgba(255,252,246,.92)", fonts: "playful", effect: "leaves", pattern: "check", patternColor: "#e53e3e", background: "linear-gradient(180deg,#fffaf0 0%,#f0f9e8 100%)", ink: "#2a1a14", muted: "#6a5148", accent: "#c53030", accentHi: "#f08080", accentLo: "#8a1c1c", line: "#ecd8cc", decor: "🧺🥪🍓🌳☀️🍋", sparks: ["#48bb78", "#9ae6b4", "#f6e05e"] }),
];

const STICKERS: Record<string, string[]> = {
  balloons: ["balloons", "gift", "cake", "party-hat"], jungle: ["lion", "parrot"], space: ["rocket", "planet"],
  disco: ["disco-ball", "vinyl", "roller-skate"], glamour: ["champagne-glasses", "gold-star", "champagne-bottle"],
  champagne: ["champagne-bottle", "champagne-glasses", "gold-star"], glitter: ["gold-star", "party-hat", "champagne-glasses"],
  eighties: ["vinyl", "roller-skate"], student: ["student-cap", "diploma", "champagne-bottle"], halloween: ["pumpkin", "ghost"],
  newyear: ["fireworks", "clock", "champagne-glasses"], wedding: ["rings", "wedding-cake"], christmas: ["santa-hat", "gingerbread-heart", "ornament"],
  crayfish: ["crayfish", "lantern"], midsummer: ["flower-wreath", "strawberry"], football: ["football", "trophy", "whistle"],
  sports: ["trophy", "football", "whistle"], hockey: ["trophy", "whistle"], bbq: ["grill", "hotdog"], beach: ["beach-ball", "ice-cream"],
  brannboll: ["ice-cream", "beach-ball"], picnic: ["strawberry", "ice-cream"],
};
for (const theme of PARTY_THEMES) {
  theme.stickers = STICKERS[theme.key] ?? [];
  const back = themePicture(theme.key, "background");
  const top = themePicture(theme.key, "header");
  if (back) theme.image = libraryUrl(back.id);
  if (top) theme.header = libraryUrl(top.id);
}

const KIND_CATEGORY: Record<string, ThemeCategory> = { child_birthday: "kids", birthday: "party", party: "party", dinner: "dinner", match: "sports", bbq: "outdoor", outdoor: "outdoor" };
const KIND_THEME: Record<string, string> = { child_birthday: "balloons", birthday: "glitter", party: "disco", dinner: "elegant", match: "football", bbq: "bbq", outdoor: "brannboll" };

export const kindCategory = (kind: string): ThemeCategory => KIND_CATEGORY[kind] ?? "party";
export const kindTheme = (kind: string): string => KIND_THEME[kind] ?? "balloons";

export function partyTheme(key: string | null | undefined): PartyTheme {
  return PARTY_THEMES.find((t) => t.key === key) ?? PARTY_THEMES[0];
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const light = (c: string) => {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
};

// An own theme as a look; its pictures come from where the viewer may read them (`picture`).
export function customTheme(c: CustomTheme, picture: (slot: "header" | "background", version: string) => string): PartyTheme {
  const decor = emoji(c.decor || "");
  const dark = !light(mix(c.bg, c.bg2, 0.5));
  return {
    key: "custom", category: "custom", dark,
    background: `linear-gradient(170deg,${c.bg} 0%,${c.bg2} 100%)`, pattern: c.pattern, patternColor: c.accent,
    band: `linear-gradient(90deg,${mix(c.accent, "#000000", 0.3)},${mix(c.accent, "#ffffff", 0.5)},${c.accent})`,
    surface: dark ? `${mix(c.bg, "#000000", 0.35)}e6` : "rgba(255,255,255,.88)",
    ink: c.ink, muted: mix(c.ink, dark ? "#000000" : "#ffffff", 0.35),
    accent: c.accent, accentHi: mix(c.accent, "#ffffff", 0.5), accentLo: mix(c.accent, "#000000", 0.35),
    line: mix(c.accent, dark ? "#000000" : "#ffffff", 0.6),
    decor: decor.length ? decor : ["🎉"], fonts: c.font ?? "playful", effect: c.effect ?? "confetti",
    sparks: [c.accent, mix(c.accent, "#ffffff", 0.5), c.bg2], stickers: [],
    image: c.background ? picture("background", c.background) : undefined, header: c.header ? picture("header", c.header) : undefined,
  };
}

function svg(body: string, size: number) {
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`)}")`;
}

// The pattern as CSS layers (images and their sizes), in the theme's pattern colour.
function patternLayers(pattern: PatternKey, c: string): [string, string][] {
  switch (pattern) {
    case "confetti":
      return [[svg(`<g fill='${c}' opacity='.5'><rect x='8' y='10' width='7' height='3' rx='1' transform='rotate(25 11 11)'/><circle cx='52' cy='18' r='3'/><rect x='34' y='48' width='8' height='3' rx='1' transform='rotate(-35 38 49)'/><circle cx='12' cy='60' r='2'/><path d='M62 52l3 6-6 1z'/></g>`, 76), "76px 76px"]];
    case "dots":
      return [[`radial-gradient(${c}55 2px, transparent 2.5px)`, "22px 22px"]];
    case "stars":
      return [[svg(`<g fill='${c}'><path opacity='.7' d='M20 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'/><circle cx='70' cy='30' r='1.4' opacity='.6'/><circle cx='44' cy='70' r='1' opacity='.5'/><path opacity='.45' d='M80 72l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z'/><circle cx='10' cy='86' r='1.2' opacity='.5'/></g>`, 96), "96px 96px"]];
    case "stripes":
      return [[`repeating-linear-gradient(135deg, ${c}1c 0 14px, transparent 14px 34px)`, "auto"]];
    case "hearts":
      return [[svg(`<path fill='${c}' opacity='.4' d='M20 30s-9-5.6-9-11.5A5 5 0 0 1 20 16a5 5 0 0 1 9 2.5C29 24.4 20 30 20 30z'/><path fill='${c}' opacity='.28' d='M58 62s-6-3.8-6-7.7a3.4 3.4 0 0 1 6-1.7 3.4 3.4 0 0 1 6 1.7c0 3.9-6 7.7-6 7.7z'/>`, 80), "80px 80px"]];
    case "check":
      return [[`repeating-linear-gradient(0deg, ${c}1a 0 16px, transparent 16px 32px), repeating-linear-gradient(90deg, ${c}1a 0 16px, transparent 16px 32px)`, "auto"]];
    default:
      return [];
  }
}

// The page's whole look: the pattern over the background (or over the own picture, softened),
// its typefaces, and the palette as CSS variables for the cards and fields.
export function themeStyle(theme: PartyTheme): CSSProperties {
  const layers = patternLayers(theme.pattern, theme.patternColor);
  const images = layers.map(([i]) => i);
  const sizes = layers.map(([, s]) => s);
  if (theme.image) {
    images.push(theme.dark ? "linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35))" : "linear-gradient(rgba(255,255,255,.2),rgba(255,255,255,.2))", `url("${theme.image}")`);
    sizes.push("auto", "cover");
  } else {
    images.push(theme.background);
    // A background can be several gradients; each needs its own size, or the pattern's is reused.
    sizes.push(...Array(Math.max(1, theme.background.split("gradient(").length - 1)).fill("auto"));
  }
  const f = FONTS[theme.fonts];
  return {
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: "center",
    backgroundColor: theme.dark ? "#0d0b08" : "#ffffff",
    color: theme.ink,
    colorScheme: theme.dark ? "dark" : "light",
    fontFamily: f.body,
    ["--pt-surface" as string]: theme.surface,
    ["--pt-ink" as string]: theme.ink,
    ["--pt-muted" as string]: theme.muted,
    ["--pt-accent" as string]: theme.accent,
    ["--pt-hi" as string]: theme.accentHi,
    ["--pt-lo" as string]: theme.accentLo,
    ["--pt-line" as string]: theme.line,
    ["--pt-display" as string]: f.display,
    ["--pt-script" as string]: f.script,
    ["--pt-field" as string]: theme.dark ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.9)",
    ["--pt-on-accent" as string]: light(theme.accent) ? "#1a1208" : "#ffffff",
  };
}
