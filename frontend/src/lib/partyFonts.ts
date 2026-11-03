// The typefaces of the party pages (3.4.0), served from the app itself (no font service is asked).
// All are under the SIL Open Font License.
import "@fontsource/abril-fatface/400.css";
import "@fontsource/yellowtail/400.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/600.css";
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/pacifico/400.css";
import "@fontsource/bungee/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/dancing-script/600.css";
import "@fontsource/anton/400.css";

export type FontSet = "gala" | "playful" | "retro" | "classic" | "sporty";
export const FONT_SETS: FontSet[] = ["gala", "playful", "retro", "classic", "sporty"];

// display: the big title; script: the handwritten lines; body: the text.
export const FONTS: Record<FontSet, { display: string; script: string; body: string; caps?: boolean }> = {
  gala: { display: "'Abril Fatface', Didot, Georgia, serif", script: "Yellowtail, 'Brush Script MT', cursive", body: "Jost, Futura, system-ui, sans-serif" },
  playful: { display: "Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif", script: "Pacifico, 'Brush Script MT', cursive", body: "Fredoka, system-ui, sans-serif" },
  retro: { display: "Bungee, Impact, system-ui, sans-serif", script: "Yellowtail, 'Brush Script MT', cursive", body: "Jost, system-ui, sans-serif", caps: true },
  classic: { display: "'Playfair Display', Georgia, serif", script: "'Dancing Script', 'Brush Script MT', cursive", body: "Jost, system-ui, sans-serif" },
  sporty: { display: "Anton, Impact, 'Arial Narrow', sans-serif", script: "Yellowtail, 'Brush Script MT', cursive", body: "Jost, system-ui, sans-serif", caps: true },
};
