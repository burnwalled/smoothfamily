"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useThemePreference } from "./theme-provider";

type ThemePreference = "light" | "dark";

const STORAGE_KEY = "boet-theme-preference";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function resolveApiUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawValue;
  }
}

function isThemePreference(
  value: string | null | undefined,
): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function ThemeToggle() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useThemePreference();
  const { isSignedIn, getToken } = useAuth();
  const localPreferenceRef = useRef<ThemePreference | null>(null);
  const serverPreferenceRef = useRef<ThemePreference | null>(null);
  const apiUrl = resolveApiUrl(API_URL);

  useEffect(() => {
    async function syncFromServer() {
      if (!isSignedIn || !apiUrl) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const response = await fetch(`${apiUrl}/api/v1/users/me`, {
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
      if (
        !isSignedIn ||
        !apiUrl ||
        serverPreferenceRef.current === currentTheme
      ) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        const response = await fetch(`${apiUrl}/api/v1/users/me`, {
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
