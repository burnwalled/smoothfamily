"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type FamilyOverview = {
  family_id: string;
};

type UnreadMessage = {
  id: string;
  group_id: string;
  group_name: string;
  sender_user_id: string;
  sender_email: string;
  content: string;
  created_at: string;
};

type UnreadWidgetResponse = {
  family_id: string;
  unread_count: number;
  messages: UnreadMessage[];
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

function formatStart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function UnreadChatWidget() {
  const t = useTranslations("chat");
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<UnreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canFetch = useMemo(
    () => Boolean(apiUrl) && isSignedIn,
    [apiUrl, isSignedIn],
  );

  useEffect(() => {
    async function loadWidget() {
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

        const overviewResponse = await fetch(
          `${apiUrl}/api/v1/families/current/overview`,
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
          `${apiUrl}/api/v1/families/${overview.family_id}/chat/widgets/unread?limit=5`,
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

        const payload = (await widgetResponse.json()) as UnreadWidgetResponse;
        setUnreadCount(payload.unread_count);
        setMessages(payload.messages);
      } catch (error) {
        const detail = error instanceof Error ? ` (${error.message})` : "";
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("widgetTitle")}</h2>
        <span className="text-xs text-muted-foreground">{unreadCount}</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyUnread")}</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className="rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {message.group_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatStart(message.created_at)}
                </p>
              </div>
              <p className="mt-1 text-sm font-medium">{message.sender_email}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {message.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
