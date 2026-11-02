"use client";

// Theme switching: sets data-theme on <html>; palettes live in globals.css.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeId = "forest" | "ocean" | "sunset" | "lavender" | "midnight" | "sand" | "berry" | "citrus" | "aurora";

// Swatch colors shown in the theme picker (primary / background / accent).
export const THEMES: { id: ThemeId; swatch: [string, string, string] }[] = [
  { id: "forest", swatch: ["#1E3328", "#DEEADB", "#D98E2B"] },
  { id: "ocean", swatch: ["#14384A", "#D2E6F2", "#F08A4B"] },
  { id: "sunset", swatch: ["#6B3414", "#FCE0CC", "#D94F30"] },
  { id: "lavender", swatch: ["#3E2D6B", "#E6DCF6", "#C99A2E"] },
  { id: "midnight", swatch: ["#1E2936", "#11161D", "#E5A33F"] },
  { id: "sand", swatch: ["#54491F", "#F0E4C8", "#C2703D"] },
  { id: "berry", swatch: ["#881C58", "#FADEEB", "#12968C"] },
  { id: "citrus", swatch: ["#2A6A3A", "#FFF1BE", "#F27C12"] },
  { id: "aurora", swatch: ["#1C3A58", "#0F1726", "#48DCB2"] },
];

export function isTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

type ThemeContextValue = { theme: ThemeId; setTheme: (theme: ThemeId) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "sf.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("forest");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) setThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
