"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type FamilyOverview = {
  family_id: string;
};

type OpenListWidgetItem = {
  id: string;
  title: string;
  open_items_count: number;
  total_items_count: number;
};

type OpenListsWidgetResponse = {
  family_id: string;
  lists: OpenListWidgetItem[];
};

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

export default function OpenListsWidget() {
  const t = useTranslations("lists");
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [lists, setLists] = useState<OpenListWidgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canFetch = useMemo(() => Boolean(apiUrl) && isSignedIn, [apiUrl, isSignedIn]);

  useEffect(() => {
    async function loadWidget(): Promise<void> {
      if (!apiUrl) {
        setError("NEXT_PUBLIC_API_URL is not configured.");
        setLoading(false);
        return;
      }

      if (!isSignedIn) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          setError(t("errors.auth"));
          return;
        }

        const overviewResponse = await fetch(`${apiUrl}/api/v1/families/current/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!overviewResponse.ok) {
          setError(t("errors.load"));
          return;
        }

        const overview = (await overviewResponse.json()) as FamilyOverview;
        const widgetResponse = await fetch(
          `${apiUrl}/api/v1/families/${overview.family_id}/lists/widgets/open?limit=5`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!widgetResponse.ok) {
          setError(t("errors.load"));
          return;
        }

        const payload = (await widgetResponse.json()) as OpenListsWidgetResponse;
        setLists(payload.lists);
      } catch (loadError) {
        const detail = loadError instanceof Error ? ` (${loadError.message})` : "";
        setError(`${t("errors.network")}${detail}`);
      } finally {
        setLoading(false);
      }
    }

    if (canFetch) {
      void loadWidget();
    } else {
      setLoading(false);
    }
  }, [apiUrl, canFetch, getToken, isSignedIn, t]);

  return (
    <section className="portal-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("widgetTitle")}</h2>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyWidget")}</p>
      ) : (
        <ul className="space-y-2">
          {lists.map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              <p className="text-sm font-medium">{entry.title}</p>
              <p className="text-xs text-muted-foreground">
                {t("remainingCount", {
                  open: entry.open_items_count,
                  total: entry.total_items_count,
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
