// The party picture library (3.4.0): backgrounds, top pictures and stickers that come with the
// app (under public/party-assets), for the themes and for the hosts' own posters.
import type { ThemeCategory } from "@/lib/partyThemes";

export type LibraryKind = "background" | "header" | "sticker";
export type LibraryItem = { id: string; kind: LibraryKind; theme: string | null; category?: ThemeCategory; file: string };

export const LIBRARY: LibraryItem[] = [
  { id: "glamour-background", kind: "background", theme: "glamour", file: "glamour-background.jpg" },
  { id: "glamour-header", kind: "header", theme: "glamour", file: "glamour-header.jpg" },
  { id: "disco-background", kind: "background", theme: "disco", file: "disco-background.jpg" },
  { id: "disco-header", kind: "header", theme: "disco", file: "disco-header.jpg" },
  { id: "balloons-background", kind: "background", theme: "balloons", file: "balloons-background.jpg" },
  { id: "balloons-header", kind: "header", theme: "balloons", file: "balloons-header.jpg" },
  { id: "jungle-background", kind: "background", theme: "jungle", file: "jungle-background.jpg" },
  { id: "jungle-header", kind: "header", theme: "jungle", file: "jungle-header.jpg" },
  { id: "space-background", kind: "background", theme: "space", file: "space-background.jpg" },
  { id: "space-header", kind: "header", theme: "space", file: "space-header.jpg" },
  { id: "christmas-background", kind: "background", theme: "christmas", file: "christmas-background.jpg" },
  { id: "christmas-header", kind: "header", theme: "christmas", file: "christmas-header.jpg" },
  { id: "crayfish-background", kind: "background", theme: "crayfish", file: "crayfish-background.jpg" },
  { id: "crayfish-header", kind: "header", theme: "crayfish", file: "crayfish-header.jpg" },
  { id: "football-background", kind: "background", theme: "football", file: "football-background.jpg" },
  { id: "football-header", kind: "header", theme: "football", file: "football-header.jpg" },
  { id: "bbq-background", kind: "background", theme: "bbq", file: "bbq-background.jpg" },
  { id: "bbq-header", kind: "header", theme: "bbq", file: "bbq-header.jpg" },
  { id: "beach-background", kind: "background", theme: "beach", file: "beach-background.jpg" },
  { id: "beach-header", kind: "header", theme: "beach", file: "beach-header.jpg" },
  { id: "champagne-bottle", kind: "sticker", theme: null, category: "party", file: "champagne-bottle.webp" },
  { id: "party-hat", kind: "sticker", theme: null, category: "party", file: "party-hat.webp" },
  { id: "cake", kind: "sticker", theme: null, category: "kids", file: "cake.webp" },
  { id: "football-us", kind: "sticker", theme: null, category: "sports", file: "football-us.webp" },
  { id: "football", kind: "sticker", theme: null, category: "sports", file: "football.webp" },
  { id: "grill", kind: "sticker", theme: null, category: "outdoor", file: "grill.webp" },
  { id: "beach-ball", kind: "sticker", theme: null, category: "outdoor", file: "beach-ball.webp" },
  { id: "ornament", kind: "sticker", theme: null, category: "dinner", file: "ornament.webp" },
  { id: "disco-ball", kind: "sticker", theme: null, category: "party", file: "disco-ball.webp" },
  { id: "ice-cream", kind: "sticker", theme: "beach", category: "outdoor", file: "ice-cream.webp" },
  { id: "balloons", kind: "sticker", theme: "balloons", category: "kids", file: "balloons.webp" },
  { id: "gift", kind: "sticker", theme: "balloons", category: "kids", file: "gift.webp" },
  { id: "roller-skate", kind: "sticker", theme: "disco", category: "party", file: "roller-skate.webp" },
  { id: "vinyl", kind: "sticker", theme: "disco", category: "party", file: "vinyl.webp" },
  { id: "lion", kind: "sticker", theme: "jungle", category: "kids", file: "lion.webp" },
  { id: "parrot", kind: "sticker", theme: "jungle", category: "kids", file: "parrot.webp" },
  { id: "trophy", kind: "sticker", theme: "football", category: "sports", file: "trophy.webp" },
  { id: "whistle", kind: "sticker", theme: "football", category: "sports", file: "whistle.webp" },
  { id: "champagne-glasses", kind: "sticker", theme: "glamour", category: "party", file: "champagne-glasses.webp" },
  { id: "gold-star", kind: "sticker", theme: "glamour", category: "party", file: "gold-star.webp" },
  { id: "hotdog", kind: "sticker", theme: "bbq", category: "outdoor", file: "hotdog.webp" },
  { id: "gingerbread-heart", kind: "sticker", theme: "christmas", category: "dinner", file: "gingerbread-heart.webp" },
  { id: "santa-hat", kind: "sticker", theme: "christmas", category: "dinner", file: "santa-hat.webp" },
  { id: "crayfish", kind: "sticker", theme: "crayfish", category: "dinner", file: "crayfish.webp" },
  { id: "lantern", kind: "sticker", theme: "crayfish", category: "dinner", file: "lantern.webp" },
  { id: "planet", kind: "sticker", theme: "space", category: "kids", file: "planet.webp" },
  { id: "rocket", kind: "sticker", theme: "space", category: "kids", file: "rocket.webp" },
  { id: "midsummer-background", kind: "background", theme: "midsummer", file: "midsummer-background.jpg" },
  { id: "flower-wreath", kind: "sticker", theme: "midsummer", category: "dinner", file: "flower-wreath.webp" },
  { id: "strawberry", kind: "sticker", theme: "midsummer", category: "dinner", file: "strawberry.webp" },
  { id: "student-background", kind: "background", theme: "student", file: "student-background.jpg" },
  { id: "diploma", kind: "sticker", theme: "student", category: "party", file: "diploma.webp" },
  { id: "student-cap", kind: "sticker", theme: "student", category: "party", file: "student-cap.webp" },
  { id: "student-header", kind: "header", theme: "student", file: "student-header.jpg" },
  { id: "wedding-background", kind: "background", theme: "wedding", file: "wedding-background.jpg" },
  { id: "wedding-cake", kind: "sticker", theme: "wedding", category: "dinner", file: "wedding-cake.webp" },
  { id: "rings", kind: "sticker", theme: "wedding", category: "dinner", file: "rings.webp" },
  { id: "wedding-header", kind: "header", theme: "wedding", file: "wedding-header.jpg" },
  { id: "halloween-background", kind: "background", theme: "halloween", file: "halloween-background.jpg" },
  { id: "pumpkin", kind: "sticker", theme: "halloween", category: "party", file: "pumpkin.webp" },
  { id: "ghost", kind: "sticker", theme: "halloween", category: "party", file: "ghost.webp" },
  { id: "halloween-header", kind: "header", theme: "halloween", file: "halloween-header.jpg" },
  { id: "fireworks", kind: "sticker", theme: "newyear", category: "party", file: "fireworks.webp" },
  { id: "clock", kind: "sticker", theme: "newyear", category: "party", file: "clock.webp" },
  { id: "newyear-header", kind: "header", theme: "newyear", file: "newyear-header.jpg" },
];

export const libraryUrl = (id: string) => {
  const item = LIBRARY.find((x) => x.id === id);
  return item ? `/party-assets/${item.file}` : "";
};
export const themePicture = (theme: string, kind: "background" | "header") => LIBRARY.find((x) => x.theme === theme && x.kind === kind);
// The stickers that suit a theme: its own first, then those of its kind of party.
export function themeStickers(theme: string, category: string): string[] {
  const own = LIBRARY.filter((x) => x.kind === "sticker" && x.theme === theme).map((x) => x.id);
  return own;
}
