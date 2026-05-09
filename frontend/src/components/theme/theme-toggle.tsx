"use client";

import { useAuth } from "@clerk/nextjs";
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  isTheme,
  THEMES,
  type Theme,
  useThemePreference,
} from "./theme-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function resolveApiUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  try {
    const parsed = new URL(rawValue);
    if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawValue;
  }
}

const THEME_SWATCHES: Record<Theme, string> = {
  light: "#3388dd",
  dark: "#66a5e6",
  forest: "#2d8b57",
  ocean: "#0891b2",
  sunset: "#f97316",
  nordic: "#0c4a8f",
  "high-contrast": "#000000",
  metro: "#0078d7",
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  forest: "Forest",
  ocean: "Ocean",
  sunset: "Sunset",
  nordic: "Nordic",
  "high-contrast": "High contrast",
  metro: "Metro",
};

export function ThemeToggle() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useThemePreference();
  const { isSignedIn, getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const serverPreferenceRef = useRef<Theme | null>(null);
  const localPreferenceRef = useRef<Theme | null>(null);
  const apiUrl = resolveApiUrl(API_URL);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    async function syncFromServer() {
      if (!isSignedIn || !apiUrl) return;
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch(`${apiUrl}/api/v1/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { theme_preference?: string };
        if (!isTheme(data.theme_preference)) return;
        serverPreferenceRef.current = data.theme_preference;
        if (!localPreferenceRef.current) {
          localPreferenceRef.current = data.theme_preference;
          if (theme !== data.theme_preference) {
            setTheme(data.theme_preference);
          }
          return;
        }
        if (localPreferenceRef.current !== data.theme_preference) {
          await fetch(`${apiUrl}/api/v1/users/me`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              theme_preference: localPreferenceRef.current,
            }),
          });
          serverPreferenceRef.current = localPreferenceRef.current;
        }
      } catch {
        // Sync errors are non-fatal; local preference is source of truth.
      }
    }
    void syncFromServer();
  }, [getToken, isSignedIn, setTheme, theme]);

  useEffect(() => {
    localPreferenceRef.current = theme;
    async function syncToServer() {
      if (!isSignedIn || !apiUrl || serverPreferenceRef.current === theme)
        return;
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch(`${apiUrl}/api/v1/users/me`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ theme_preference: theme }),
        });
        if (response.ok) serverPreferenceRef.current = theme;
      } catch {
        // Next successful request will reconcile.
      }
    }
    void syncToServer();
  }, [getToken, isSignedIn, theme]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={t("toggleTheme")}
        title={t("toggleTheme")}
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{THEME_LABELS[theme]}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden border border-border bg-card shadow-md"
          style={{ borderRadius: "var(--radius)" }}>
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTheme(t);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-secondary",
                theme === t
                  ? "font-semibold text-primary"
                  : "text-foreground",
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ background: THEME_SWATCHES[t] }}
              />
              {THEME_LABELS[t]}
              {theme === t ? (
                <span className="ml-auto text-primary">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
