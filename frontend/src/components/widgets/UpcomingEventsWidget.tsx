"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type FamilyOverview = {
  family_id: string;
};

type UpcomingEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  tagged_user_ids: string[];
  source_type: "family" | "external";
  source_label: string;
  member_user_id: string | null;
};

type UpcomingResponse = {
  family_id: string;
  events: UpcomingEvent[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatStart(value: string, allDay: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  if (allDay) {
    return new Intl.DateTimeFormat("sv-SE", {
      month: "short",
      day: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function UpcomingEventsWidget() {
  const t = useTranslations("calendar");
  const { isSignedIn, getToken } = useAuth();

  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canFetch = useMemo(() => Boolean(API_URL) && isSignedIn, [isSignedIn]);

  useEffect(() => {
    async function loadEvents() {
      if (!API_URL) {
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

        const overviewResponse = await fetch(
          `${API_URL}/api/v1/families/current/overview`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!overviewResponse.ok) {
          setError(t("errors.load"));
          return;
        }

        const overview = (await overviewResponse.json()) as FamilyOverview;
        const widgetResponse = await fetch(
          `${API_URL}/api/v1/families/${overview.family_id}/calendar/widgets/upcoming?limit=5`,
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

        const payload = (await widgetResponse.json()) as UpcomingResponse;
        setEvents(payload.events);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }

    if (canFetch) {
      void loadEvents();
    } else {
      setLoading(false);
    }
  }, [canFetch, getToken, isSignedIn, t]);

  return (
    <section className="portal-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("widgetTitle")}</h2>
        <span className="text-xs text-muted-foreground">{events.length}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              <p className="text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatStart(event.start_at, event.all_day)}
              </p>
              <p className="text-xs text-muted-foreground">{event.source_label}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
