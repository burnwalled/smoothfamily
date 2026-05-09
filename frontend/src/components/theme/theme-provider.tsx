"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const THEMES = [
  "light",
  "dark",
  "forest",
  "ocean",
  "sunset",
  "nordic",
  "high-contrast",
  "metro",
] as const;

export type Theme = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "boet-theme-preference";

const THEME_CLASSES = THEMES.filter((t) => t !== "light");

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isTheme(value: string | null | undefined): value is Theme {
  return THEMES.includes(value as Theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState((prev) => (prev === nextTheme ? prev : nextTheme));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    THEME_CLASSES.forEach((c) => root.classList.remove(c));
    if (theme !== "light") {
      root.classList.add(theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme }),
    [setTheme, theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreference must be used within ThemeProvider");
  }
  return context;
}
