"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type FamilyMember = {
  user_id: string;
  email: string;
  role: string;
  is_primary: boolean;
  color_hex: string | null;
};

type PendingInvite = {
  id: string;
  invited_email: string;
  role: string;
  expires_at: string;
  created_at: string;
};

type FamilyOverview = {
  family_id: string;
  family_name: string;
  members: FamilyMember[];
  pending_invites: PendingInvite[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

export default function FamilyPage() {
  const t = useTranslations("family");
  const { isSignedIn, getToken } = useAuth();

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("parent");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  useEffect(() => {
    async function loadOverview() {
      if (!isSignedIn || !API_URL) {
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

        const response = await fetch(`${API_URL}/api/v1/families/current/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          setError(payload.detail ?? t("errors.load"));
          return;
        }

        const payload = (await response.json()) as FamilyOverview;
        setOverview(payload);
      } catch {
        setError(t("errors.network"));
      } finally {
        setLoading(false);
      }
    }

    void loadOverview();
  }, [getToken, isSignedIn, t]);

  async function onInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !API_URL || !inviteEmail.trim()) {
      return;
    }

    setInviteSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${API_URL}/api/v1/families/${overview.family_id}/invites`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: inviteEmail.trim().toLowerCase(),
            role: inviteRole,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.invite"));
        return;
      }

      const createdInvite = (await response.json()) as PendingInvite;
      setOverview((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          pending_invites: [
            {
              id: createdInvite.id,
              invited_email: createdInvite.invited_email,
              role: createdInvite.role,
              expires_at: createdInvite.expires_at,
              created_at: createdInvite.created_at,
            },
            ...previous.pending_invites,
          ],
        };
      });
      setInviteEmail("");
    } catch {
      setError(t("errors.network"));
    } finally {
      setInviteSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!overview) {
    return <p className="text-sm text-red-500">{error ?? t("errors.load")}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="portal-card">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{overview.family_name}</p>
      </section>

      <section className="portal-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("membersTitle")}</h2>
          <span className="text-xs text-muted-foreground">
            {overview.members.length} {t("membersCount")}
          </span>
        </div>

        <ul className="space-y-2">
          {overview.members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: member.color_hex ?? "#999999" }}
                />
                <div>
                  <p className="text-sm font-medium">{member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
              </div>
              {member.is_primary ? (
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                  {t("primary")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="portal-card space-y-3">
        <h2 className="text-base font-semibold">{t("inviteTitle")}</h2>

        <form onSubmit={onInviteSubmit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder={t("emailPlaceholder")}
            className="rounded-md border bg-background px-3 py-2 text-sm"
            style={{ borderColor: "rgb(var(--color-border))" }}
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            <option value="parent">parent</option>
            <option value="child">child</option>
          </select>
          <button
            type="submit"
            disabled={inviteSubmitting}
            className="rounded-md border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "rgb(var(--color-border))" }}
          >
            {inviteSubmitting ? t("inviting") : t("invite")}
          </button>
        </form>

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </section>

      <section className="portal-card space-y-3">
        <h2 className="text-base font-semibold">{t("pendingInvitesTitle")}</h2>

        {overview.pending_invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pendingInvitesEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {overview.pending_invites.map((invite) => (
              <li
                key={invite.id}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "rgb(var(--color-border))" }}
              >
                <p className="font-medium">{invite.invited_email}</p>
                <p className="text-xs text-muted-foreground">
                  {invite.role} · {t("expires")}: {formatDate(invite.expires_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
