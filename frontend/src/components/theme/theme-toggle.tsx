"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

type ThemePreference = "light" | "dark";

const STORAGE_KEY = "boet-theme-preference";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function ThemeToggle() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const { isSignedIn, getToken } = useAuth();
  const localPreferenceRef = useRef<ThemePreference | null>(null);
  const serverPreferenceRef = useRef<ThemePreference | null>(null);

  useEffect(() => {
    const localPreference = localStorage.getItem(STORAGE_KEY);
    if (!isThemePreference(localPreference)) {
      return;
    }

    localPreferenceRef.current = localPreference;
    if (theme !== localPreference) {
      setTheme(localPreference);
    }
  }, [setTheme, theme]);

  useEffect(() => {
    async function syncFromServer() {
      if (!isSignedIn || !API_URL) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { theme_preference?: string };
        if (!isThemePreference(data.theme_preference)) {
          return;
        }

        serverPreferenceRef.current = data.theme_preference;

        if (!localPreferenceRef.current) {
          localPreferenceRef.current = data.theme_preference;
          localStorage.setItem(STORAGE_KEY, data.theme_preference);
          if (theme !== data.theme_preference) {
            setTheme(data.theme_preference);
          }
          return;
        }

        if (localPreferenceRef.current !== data.theme_preference) {
          await fetch(`${API_URL}/api/v1/auth/me`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ theme_preference: localPreferenceRef.current }),
          });
          serverPreferenceRef.current = localPreferenceRef.current;
        }
      } catch {
        // Ignore sync errors in client; local preference remains source of truth.
      }
    }

    void syncFromServer();
  }, [getToken, isSignedIn, setTheme, theme]);

  useEffect(() => {
    if (!isThemePreference(theme)) {
      return;
    }

    const currentTheme: ThemePreference = theme;

    localPreferenceRef.current = currentTheme;
    localStorage.setItem(STORAGE_KEY, currentTheme);

    async function syncToServer() {
      if (!isSignedIn || !API_URL || serverPreferenceRef.current === currentTheme) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ theme_preference: currentTheme }),
        });

        if (response.ok) {
          serverPreferenceRef.current = currentTheme;
        }
      } catch {
        // Ignore sync errors in client; next successful request will reconcile.
      }
    }

    void syncToServer();
  }, [getToken, isSignedIn, theme]);

  const nextTheme: ThemePreference = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={t("toggleTheme")}
      title={t("toggleTheme")}
    >
      {theme === "dark" ? t("dark") : t("light")}
    </button>
  );
}