"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type FamilyOverview = {
  family_id: string;
};

type PendingInvite = {
  id: string;
  invited_email: string;
  role: string;
  expires_at: string;
};

type RecentMemberChange = {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
};

type PendingMembersWidgetResponse = {
  family_id: string;
  pending_invites_count: number;
  invites: PendingInvite[];
  recent_member_changes: RecentMemberChange[];
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default function PendingMembersWidget() {
  const t = useTranslations("family");
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [data, setData] = useState<PendingMembersWidgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          `${apiUrl}/api/v1/families/${overview.family_id}/members/widgets/pending`,
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

        const payload =
          (await widgetResponse.json()) as PendingMembersWidgetResponse;
        setData(payload);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }

    void loadWidget();
  }, [apiUrl, getToken, isSignedIn, t]);

  return (
    <section className="portal-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("pendingWidgetTitle")}</h2>
        <span className="text-xs text-muted-foreground">
          {data?.pending_invites_count ?? 0}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : !data ||
        (data.invites.length === 0 &&
          data.recent_member_changes.length === 0) ? (
        <p className="text-sm text-muted-foreground">
          {t("pendingWidgetEmpty")}
        </p>
      ) : (
        <div className="space-y-3">
          {data.invites.length > 0 ? (
            <ul className="space-y-2">
              {data.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <p className="text-sm font-medium">{invite.invited_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.role} · {t("expires")}:{" "}
                    {formatDate(invite.expires_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          {data.recent_member_changes.length > 0 ? (
            <ul className="space-y-2">
              {data.recent_member_changes.slice(0, 3).map((member) => (
                <li
                  key={member.user_id}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <p className="text-sm font-medium">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.role} · {formatDate(member.joined_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
