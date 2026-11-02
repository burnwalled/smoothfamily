import type { Config } from "tailwindcss";

// All colors come from CSS variables defined in globals.css so that the user's
// chosen theme (data-theme attribute on <html>) restyles the whole app.
function v(name: string): string {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: v("c-base"), // page background
        surface: v("c-surface"), // cards
        edge: v("c-edge"), // borders
        ink: v("c-ink"), // main text
        muted: v("c-muted"), // secondary text
        primary: {
          900: v("c-primary-900"),
          800: v("c-primary-800"),
          700: v("c-primary-700"),
          100: v("c-primary-100"),
        },
        accent: { DEFAULT: v("c-accent"), soft: v("c-accent-soft") },
      },
      borderRadius: { card: "14px" }
    }
  },
  plugins: []
};
export default config;
