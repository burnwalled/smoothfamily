// The looks a party's page can wear (3.4.0) – the invitation and, separately, the thank-you – by
// the kind of party they suit, and the family's own (colours, a pattern, emoji and pictures of
// its own). Drawn with gradients, CSS patterns and emoji, so the page stays light.
import type { CSSProperties } from "react";

export type PatternKey = "none" | "confetti" | "dots" | "stars" | "stripes" | "hearts" | "check";
export type ThemeCategory = "kids" | "party" | "dinner" | "sports" | "outdoor";
export type PartyTheme = {
  key: string;
  category: ThemeCategory | "custom";
  // The page: a gradient, with a pattern (in its colour) over it, and an own picture under both.
  gradient: string;
  pattern: PatternKey;
  patternColor: string;
  band: string;
  accent: string;
  ink: string;
  decor: string[];
  font?: "serif" | "mono";
  image?: string;
  header?: string;
};

// An own theme as the server keeps it.
export type CustomTheme = { id: string; name: string; bg: string; bg2: string; accent: string; ink: string; pattern: PatternKey; decor: string; header: string | null; background: string | null };

export const CATEGORIES: ThemeCategory[] = ["kids", "party", "dinner", "sports", "outdoor"];

const T = (key: string, category: ThemeCategory, gradient: string, pattern: PatternKey, patternColor: string, band: string, accent: string, ink: string, decor: string, font?: "serif" | "mono"): PartyTheme => ({
  key, category, gradient, pattern, patternColor, band, accent, ink, decor: Array.from(new Intl.Segmenter().segment(decor), (s) => s.segment).filter((s) => s.trim()), font,
});

export const PARTY_THEMES: PartyTheme[] = [
  // A child's party
  T("balloons", "kids", "linear-gradient(160deg,#ffe3ea 0%,#fff6e0 50%,#e3ecff 100%)", "confetti", "#e85d75", "linear-gradient(90deg,#e85d75,#f2b632,#3f6fb5,#7ee08a,#e85d75)", "#e0436a", "#3b2430", "🎈🎉🎂🎁🎈"),
  T("jungle", "kids", "linear-gradient(170deg,#d8f0c8 0%,#f3fae6 55%,#c9e7b1 100%)", "dots", "#5c9a3a", "linear-gradient(90deg,#2f6b33,#7aa83f,#e8b33c,#2f6b33)", "#3f7f3a", "#1f3320", "🦁🌴🐒🦜🐘🐍"),
  T("space", "kids", "radial-gradient(ellipse at 70% 10%,#4b3fa8 0%,#1d2257 45%,#0b0f2e 100%)", "stars", "#ffffff", "linear-gradient(90deg,#7b6cf6,#4fc3f7,#f6d55c,#7b6cf6)", "#8b7bff", "#f4f5ff", "🚀🪐⭐👩‍🚀🌙🛸"),
  T("ocean", "kids", "linear-gradient(180deg,#c9ecfa 0%,#e9f8ff 45%,#9fd8ec 100%)", "dots", "#ffffff", "linear-gradient(90deg,#1f7aa8,#4fc3f7,#7fd6c2,#1f7aa8)", "#1f7aa8", "#13324a", "🐳🐠🐚🌊🐙🦀"),
  T("fairytale", "kids", "linear-gradient(160deg,#f1dcff 0%,#fff0fb 55%,#ffe7f1 100%)", "stars", "#c9a227", "linear-gradient(90deg,#b39ddb,#f28fb1,#f6d55c,#b39ddb)", "#9c6ad8", "#3a2647", "🏰👑✨🧚🐉🌹", "serif"),
  T("pirate", "kids", "linear-gradient(180deg,#f6e7c1 0%,#e9d39c 45%,#5aa3c4 100%)", "stripes", "#c49a52", "linear-gradient(90deg,#1b1b1b,#b3261e,#f1c40f,#1b1b1b)", "#b3261e", "#2b1d0e", "🏴‍☠️🦜⚓🗺️💰⚔️"),
  T("dinosaur", "kids", "linear-gradient(165deg,#d9f2b4 0%,#fff3d1 55%,#ffd6a6 100%)", "dots", "#7aa83f", "linear-gradient(90deg,#4e8a2f,#f29f3d,#c2552b,#4e8a2f)", "#d86a1e", "#2c2410", "🦖🦕🌋🥚🌿🦴"),
  T("superhero", "kids", "linear-gradient(135deg,#ffdfdf 0%,#fff7d6 50%,#dbe6ff 100%)", "stars", "#f1c40f", "linear-gradient(90deg,#d32f2f,#f1c40f,#1e4fd8,#d32f2f)", "#d32f2f", "#1a1f3d", "🦸💥⚡🦹🛡️🌟"),
  T("unicorn", "kids", "linear-gradient(135deg,#ffd6f0 0%,#e6dcff 35%,#d4f4ff 70%,#fff4c9 100%)", "stars", "#ff8fd0", "linear-gradient(90deg,#ff8fd0,#b49bff,#7fd6ff,#ffe27a,#ff8fd0)", "#d14ea3", "#4a2550", "🦄🌈⭐🍭💖☁️"),
  // A party
  T("disco", "party", "radial-gradient(ellipse at 50% 0%,#a23cff 0%,#4b0f8a 40%,#14002b 100%)", "stars", "#ffd7ff", "linear-gradient(90deg,#ff2bd6,#ffd700,#00e5ff,#ff2bd6)", "#ff2bd6", "#fff3ff", "🪩🕺💃✨🎶🪩"),
  T("glitter", "party", "linear-gradient(135deg,#fff2d6 0%,#ffd9e5 40%,#f7e1ff 70%,#fff4c2 100%)", "confetti", "#d4a017", "linear-gradient(90deg,#d4a017,#f7c6d9,#fff1a8,#d4a017)", "#c08a10", "#3d2a08", "✨💫🎉🥳🎊✨"),
  T("eighties", "party", "linear-gradient(180deg,#2b0a4a 0%,#7a1f7a 45%,#ff6b9d 80%,#ffb36b 100%)", "stripes", "#00e5ff", "linear-gradient(90deg,#00e5ff,#ff2bd6,#ffe600,#00e5ff)", "#00c2e0", "#fff6ff", "📼🕹️🎧💾🌴🛼"),
  T("nineties", "party", "linear-gradient(135deg,#c2fff4 0%,#fff6c2 40%,#ffd1f2 75%,#d6d1ff 100%)", "confetti", "#7b2ff7", "linear-gradient(90deg,#14b8a6,#7b2ff7,#ff4d9d,#ffd600,#14b8a6)", "#7b2ff7", "#1c1440", "💿📟🛹🎮🍕😎"),
  T("glamour", "party", "radial-gradient(ellipse at 50% 0%,#3a2d14 0%,#16120a 55%,#000000 100%)", "dots", "#d4af37", "linear-gradient(90deg,#8a6d1f,#f5d77a,#8a6d1f)", "#d4af37", "#f8ecd0", "💎👠💄🥂🌟💋", "serif"),
  T("techno", "party", "linear-gradient(180deg,#000000 0%,#081a12 55%,#002b1c 100%)", "stripes", "#00ff9d", "linear-gradient(90deg,#00ff9d,#00b3ff,#c200ff,#00ff9d)", "#00e08a", "#e6fff5", "🎛️🔊⚡🎧🌀💚", "mono"),
  T("champagne", "party", "linear-gradient(170deg,#fff8ea 0%,#f6e6c4 55%,#ecd39a 100%)", "dots", "#ffffff", "linear-gradient(90deg,#b8925a,#f6e2b3,#b8925a)", "#a67c3d", "#3a2a12", "🍾🥂✨🥂🍾🎇", "serif"),
  T("neon", "party", "radial-gradient(ellipse at 20% 20%,#2a0845 0%,#0d0221 60%,#05010f 100%)", "dots", "#ff3cac", "linear-gradient(90deg,#ff3cac,#784ba0,#2b86c5,#00f5d4)", "#ff3cac", "#f3e9ff", "💜💚⚡🌃✨🍸"),
  // A dinner
  T("elegant", "dinner", "linear-gradient(180deg,#f7f3ec 0%,#fbf9f5 60%,#efe7da 100%)", "dots", "#d8c7a4", "linear-gradient(90deg,#b08d57,#e6d3a8,#b08d57)", "#8a6a3a", "#2b2620", "🥂🕯️🍽️🕯️🥂", "serif"),
  T("bistro", "dinner", "linear-gradient(180deg,#fff9f2 0%,#fbefe4 100%)", "check", "#c0392b", "linear-gradient(90deg,#8e1b1b,#ffffff,#8e1b1b)", "#9e2121", "#2a1410", "🍷🥖🧀🍝🕯️", "serif"),
  T("christmas", "dinner", "linear-gradient(180deg,#0f3d2a 0%,#14532d 55%,#7a1414 100%)", "stars", "#ffffff", "linear-gradient(90deg,#b91c1c,#f5f5f5,#15803d,#b91c1c)", "#e11d48", "#fff7ed", "🎄🎅⭐🎁❄️🕯️", "serif"),
  T("midsummer", "dinner", "linear-gradient(170deg,#fffbd1 0%,#eaf7d4 55%,#cfeec0 100%)", "confetti", "#f2c12e", "linear-gradient(90deg,#2b6cb0,#f6e05e,#2b6cb0)", "#2b6cb0", "#1e3320", "🌼💐🍓🌿🥂☀️"),
  T("crayfish", "dinner", "linear-gradient(180deg,#0f1b3d 0%,#1e3a8a 55%,#b91c1c 100%)", "dots", "#fca5a5", "linear-gradient(90deg,#dc2626,#fde047,#2563eb,#dc2626)", "#ef4444", "#fff7ed", "🦞🌕🍻🎏🦐🍋"),
  T("garden", "dinner", "linear-gradient(180deg,#fdf3df 0%,#f1f9e8 55%,#fde5ec 100%)", "hearts", "#f2a7bf", "linear-gradient(90deg,#f28fb1,#f6d55c,#9cc96b,#f28fb1)", "#d9658a", "#33281f", "🌸🌼🦋🌷🌻"),
  // A match
  T("football", "sports", "linear-gradient(180deg,#2f8f3a 0%,#3ca447 50%,#2f8f3a 100%)", "stripes", "#ffffff", "linear-gradient(90deg,#ffffff,#1b1b1b,#ffffff)", "#1b5e20", "#ffffff", "⚽🏟️🥅🏆📣🧣"),
  T("hockey", "sports", "linear-gradient(180deg,#eaf6ff 0%,#ffffff 50%,#d6ecfb 100%)", "stripes", "#b3d8f2", "linear-gradient(90deg,#c62828,#ffffff,#1565c0,#c62828)", "#1565c0", "#0d2236", "🏒🥅🧊🏆📣🧣"),
  T("sports", "sports", "linear-gradient(180deg,#eaf7ec 0%,#f7fbf6 60%,#eef3fb 100%)", "confetti", "#2e8b57", "linear-gradient(90deg,#2e8b57,#ffffff,#2e8b57)", "#2e8b57", "#1d2b22", "🏆🥇⚽🏀🎾"),
  // Outdoors
  T("bbq", "outdoor", "linear-gradient(180deg,#2b1408 0%,#6b2a0e 45%,#f28c28 100%)", "dots", "#ffb347", "linear-gradient(90deg,#ff6a00,#ffd000,#ff6a00)", "#ff7a1a", "#fff4e6", "🔥🍖🌭🌽🍻🥩"),
  T("brannboll", "outdoor", "linear-gradient(180deg,#bfe6ff 0%,#e8f7ff 45%,#9ad46b 100%)", "confetti", "#f6c344", "linear-gradient(90deg,#2b6cb0,#f6e05e,#48bb78,#2b6cb0)", "#2f855a", "#163020", "🏏⚾☀️🏃🍦🌳"),
  T("beach", "outdoor", "linear-gradient(180deg,#7fd3f5 0%,#bfeaf9 45%,#fbe3a6 75%,#f5cf7a 100%)", "dots", "#ffffff", "linear-gradient(90deg,#00a6d6,#ffd166,#ef476f,#00a6d6)", "#0089b8", "#10324a", "🏖️🌊☀️🍉🩱🐚"),
  T("picnic", "outdoor", "linear-gradient(180deg,#fffaf0 0%,#f0f9e8 100%)", "check", "#e53e3e", "linear-gradient(90deg,#e53e3e,#ffffff,#48bb78,#e53e3e)", "#c53030", "#2a1a14", "🧺🥪🍓🌳☀️🍋"),
];

const KIND_CATEGORY: Record<string, ThemeCategory> = { child_birthday: "kids", birthday: "party", party: "party", dinner: "dinner", match: "sports", bbq: "outdoor", outdoor: "outdoor" };
const KIND_THEME: Record<string, string> = { child_birthday: "balloons", birthday: "glitter", party: "disco", dinner: "elegant", match: "football", bbq: "bbq", outdoor: "brannboll" };

export const kindCategory = (kind: string): ThemeCategory => KIND_CATEGORY[kind] ?? "party";
export const kindTheme = (kind: string): string => KIND_THEME[kind] ?? "balloons";

export function partyTheme(key: string | null | undefined): PartyTheme {
  return PARTY_THEMES.find((t) => t.key === key) ?? PARTY_THEMES[0];
}

// An own theme as a look; its pictures come from where the viewer may read them (`picture`).
export function customTheme(c: CustomTheme, picture: (slot: "header" | "background", version: string) => string): PartyTheme {
  const decor = Array.from(new Intl.Segmenter().segment(c.decor || ""), (s) => s.segment).filter((s) => s.trim());
  return {
    key: "custom", category: "custom", gradient: `linear-gradient(170deg,${c.bg} 0%,${c.bg2} 100%)`, pattern: c.pattern, patternColor: c.accent,
    band: `linear-gradient(90deg,${c.accent},${c.bg2},${c.accent})`, accent: c.accent, ink: c.ink, decor: decor.length ? decor : ["🎉"],
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
      return [[svg(`<g fill='${c}' opacity='.55'><rect x='8' y='10' width='7' height='3' rx='1' transform='rotate(25 11 11)'/><circle cx='52' cy='18' r='3'/><rect x='34' y='48' width='8' height='3' rx='1' transform='rotate(-35 38 49)'/><circle cx='12' cy='60' r='2'/><path d='M62 52l3 6-6 1z'/></g>`, 76), "76px 76px"]];
    case "dots":
      return [[`radial-gradient(${c}66 2px, transparent 2.5px)`, "22px 22px"]];
    case "stars":
      return [[svg(`<g fill='${c}'><path opacity='.8' d='M20 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z'/><circle cx='70' cy='30' r='1.4' opacity='.7'/><circle cx='44' cy='70' r='1' opacity='.6'/><path opacity='.5' d='M80 72l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z'/><circle cx='10' cy='86' r='1.2' opacity='.6'/></g>`, 96), "96px 96px"]];
    case "stripes":
      return [[`repeating-linear-gradient(135deg, ${c}22 0 14px, transparent 14px 34px)`, "auto"]];
    case "hearts":
      return [[svg(`<path fill='${c}' opacity='.45' d='M20 30s-9-5.6-9-11.5A5 5 0 0 1 20 16a5 5 0 0 1 9 2.5C29 24.4 20 30 20 30z'/><path fill='${c}' opacity='.3' d='M58 62s-6-3.8-6-7.7a3.4 3.4 0 0 1 6-1.7 3.4 3.4 0 0 1 6 1.7c0 3.9-6 7.7-6 7.7z'/>`, 80), "80px 80px"]];
    case "check":
      return [[`repeating-linear-gradient(0deg, ${c}1f 0 16px, transparent 16px 32px), repeating-linear-gradient(90deg, ${c}1f 0 16px, transparent 16px 32px)`, "auto"]];
    default:
      return [];
  }
}

// The page's whole background: the pattern over the gradient – or over the own picture, softened.
export function themeStyle(theme: PartyTheme): CSSProperties {
  const layers = patternLayers(theme.pattern, theme.patternColor);
  const images = layers.map(([i]) => i);
  const sizes = layers.map(([, s]) => s);
  if (theme.image) {
    images.push(`linear-gradient(rgba(255,255,255,.15),rgba(255,255,255,.15))`, `url("${theme.image}")`);
    sizes.push("auto", "cover");
  } else {
    images.push(theme.gradient);
    sizes.push("auto");
  }
  return {
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
    backgroundPosition: "center",
    backgroundAttachment: theme.image ? "fixed" : undefined,
    fontFamily: theme.font === "serif" ? "Georgia, 'Times New Roman', serif" : theme.font === "mono" ? "ui-monospace, 'SF Mono', Menlo, monospace" : undefined,
  };
}
