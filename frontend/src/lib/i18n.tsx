"use client";

// Lightweight i18n: no heavy dependencies. English is the source language and is always
// bundled; every other language lives in src/locales/<code>.ts and is fetched only when chosen.
// Users pick their display language in their profile. See docs/translations.md.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import en, { type Dictionary, type TranslationKey } from "@/locales/en";

export type { TranslationKey };

export type Locale = "en" | "sv" | "nb" | "da" | "fi";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "nb", label: "Norsk" },
  { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" },
];

// BCP 47 tags for Intl date/time formatting.
const DATE_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  sv: "sv-SE",
  nb: "nb-NO",
  da: "da-DK",
  fi: "fi-FI",
};

// Each becomes its own chunk, downloaded the first time that language is used.
const LOADERS: Record<Exclude<Locale, "en">, () => Promise<{ default: Dictionary }>> = {
  sv: () => import("@/locales/sv"),
  nb: () => import("@/locales/nb"),
  da: () => import("@/locales/da"),
  fi: () => import("@/locales/fi"),
};

const loaded: Partial<Record<Locale, Dictionary>> = { en };

async function loadDictionary(locale: Locale): Promise<Dictionary> {
  const cached = loaded[locale];
  if (cached) return cached;
  const dict = (await LOADERS[locale as Exclude<Locale, "en">]()).default;
  loaded[locale] = dict;
  return dict;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  );
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  dateLocale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "sf.locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // The language on screen only changes once its dictionary has arrived, so text and date
  // formats never mix two languages.
  const [active, setActive] = useState<{ locale: Locale; dict: Dictionary }>({ locale: "en", dict: en });
  const wanted = useRef<Locale>("en");

  const show = useCallback((next: Locale) => {
    wanted.current = next;
    loadDictionary(next)
      .then((dict) => {
        if (wanted.current === next) setActive({ locale: next, dict });
      })
      .catch(() => {});
  }, []);

  // Read the persisted choice after mount (SSR-safe).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) show(stored);
  }, [show]);

  useEffect(() => {
    document.documentElement.lang = active.locale;
  }, [active.locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      show(next);
    },
    [show]
  );

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(active.dict[key] ?? en[key], vars),
    [active.dict]
  );

  return (
    <I18nContext.Provider value={{ locale: active.locale, setLocale, t, dateLocale: DATE_LOCALES[active.locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
