"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type SettingsPermissions = {
  can_manage_settings: boolean;
  can_manage_members: boolean;
  can_manage_calendar_integrations: boolean;
};

type FamilyMember = {
  user_id: string;
  email: string;
  role: string;
};

type FamilyOverview = {
  family_id: string;
  current_user_role: string;
  permissions: SettingsPermissions;
  members: FamilyMember[];
};

type ExternalCalendarFeed = {
  id: string;
  family_id: string;
  member_user_id: string;
  member_email: string;
  provider: string;
  display_name: string;
  ical_url_masked: string;
  enabled: boolean;
  last_fetched_at: string | null;
  last_fetch_status: string;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ExternalCalendarFeedsResponse = {
  feeds: ExternalCalendarFeed[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { isSignedIn, getToken } = useAuth();

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<ExternalCalendarFeed[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsSubmitting, setIntegrationsSubmitting] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  const [memberUserId, setMemberUserId] = useState("");
  const [provider, setProvider] = useState("google");
  const [displayName, setDisplayName] = useState("");
  const [icalUrl, setIcalUrl] = useState("");

  useEffect(() => {
    async function loadOverview() {
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

        const response = await fetch(
          `${API_URL}/api/v1/families/current/overview`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

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

  useEffect(() => {
    async function loadIntegrations() {
      if (!API_URL || !isSignedIn || !overview?.family_id) {
        return;
      }

      setIntegrationsLoading(true);
      setIntegrationError(null);

      try {
        const token = await getToken();
        if (!token) {
          setIntegrationError(t("errors.auth"));
          return;
        }

        const response = await fetch(
          `${API_URL}/api/v1/families/${overview.family_id}/calendar/integrations`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          setIntegrationError(payload.detail ?? t("calendar.errors.load"));
          return;
        }

        const payload =
          (await response.json()) as ExternalCalendarFeedsResponse;
        setIntegrations(payload.feeds);
      } catch {
        setIntegrationError(t("errors.network"));
      } finally {
        setIntegrationsLoading(false);
      }
    }

    void loadIntegrations();
  }, [getToken, isSignedIn, overview?.family_id, t]);

  useEffect(() => {
    if (!memberUserId && overview?.members?.length) {
      setMemberUserId(overview.members[0].user_id);
    }
  }, [memberUserId, overview?.members]);

  async function onCreateIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!overview || !API_URL) {
      return;
    }

    setIntegrationsSubmitting(true);
    setIntegrationError(null);

    try {
      const token = await getToken();
      if (!token) {
        setIntegrationError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${API_URL}/api/v1/families/${overview.family_id}/calendar/integrations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            member_user_id: memberUserId,
            provider,
            display_name: displayName.trim(),
            ical_url: icalUrl.trim(),
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setIntegrationError(payload.detail ?? t("calendar.errors.save"));
        return;
      }

      const created = (await response.json()) as ExternalCalendarFeed;
      setIntegrations((previous) => [created, ...previous]);
      setDisplayName("");
      setIcalUrl("");
    } catch {
      setIntegrationError(t("errors.network"));
    } finally {
      setIntegrationsSubmitting(false);
    }
  }

  async function onDeleteIntegration(integrationId: string) {
    if (!overview || !API_URL) {
      return;
    }

    setIntegrationError(null);

    try {
      const token = await getToken();
      if (!token) {
        setIntegrationError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${API_URL}/api/v1/families/${overview.family_id}/calendar/integrations/${integrationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setIntegrationError(payload.detail ?? t("calendar.errors.delete"));
        return;
      }

      setIntegrations((previous) =>
        previous.filter((integration) => integration.id !== integrationId),
      );
    } catch {
      setIntegrationError(t("errors.network"));
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!overview) {
    return <p className="text-sm text-red-500">{error ?? t("errors.load")}</p>;
  }

  const permissions = overview.permissions;

  return (
    <div className="space-y-4">
      <section className="portal-card">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("rbacRoleLabel")}: {overview.current_user_role}
        </p>
      </section>

      <section className="portal-card">
        <h2 className="text-base font-semibold">{t("sectionProfile")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sectionProfileDescription")}
        </p>
      </section>

      <section className="portal-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {t("sectionCalendarIntegrations")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {permissions.can_manage_calendar_integrations
              ? t("accessEdit")
              : t("accessViewOnly")}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sectionCalendarIntegrationsDescription")}
        </p>

        {permissions.can_manage_calendar_integrations ? (
          <form
            className="mt-4 grid gap-2 md:grid-cols-2"
            onSubmit={onCreateIntegration}
          >
            <select
              value={memberUserId}
              onChange={(event) => setMemberUserId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
            >
              {overview.members.map((member) => (
                <option value={member.user_id} key={member.user_id}>
                  {member.email}
                </option>
              ))}
            </select>
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
            >
              <option value="google">Google</option>
              <option value="outlook">Outlook</option>
              <option value="apple">Apple</option>
              <option value="other">Other</option>
            </select>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("calendar.form.displayName")}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
              minLength={1}
              maxLength={120}
            />
            <input
              value={icalUrl}
              onChange={(event) => setIcalUrl(event.target.value)}
              placeholder={t("calendar.form.icalUrl")}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
              type="url"
            />
            <button
              type="submit"
              disabled={integrationsSubmitting || integrationsLoading}
              className="rounded-md border px-3 py-2 text-sm font-medium md:col-span-2 md:w-fit"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {integrationsSubmitting
                ? t("calendar.form.submitting")
                : t("calendar.form.submit")}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("calendar.form.readOnly")}
          </p>
        )}

        {integrationError ? (
          <p className="mt-3 text-xs text-red-500">{integrationError}</p>
        ) : null}

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">{t("calendar.list.title")}</h3>
          {integrationsLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("calendar.loading")}
            </p>
          ) : integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("calendar.list.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {integrations.map((integration) => (
                <li
                  key={integration.id}
                  className="rounded-md border px-3 py-2"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {integration.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {integration.provider} · {integration.member_email}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">
                      {integration.last_fetch_status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {integration.ical_url_masked}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("calendar.list.lastFetched")}:{" "}
                    {formatDateTime(integration.last_fetched_at)}
                  </p>
                  {integration.last_error_message ? (
                    <p className="mt-1 text-xs text-red-500">
                      {integration.last_error_message}
                    </p>
                  ) : null}
                  {permissions.can_manage_calendar_integrations ? (
                    <button
                      type="button"
                      onClick={() => onDeleteIntegration(integration.id)}
                      className="mt-2 rounded-md border px-2 py-1 text-xs"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      {t("calendar.list.remove")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="portal-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">
            {t("sectionFamilyManagement")}
          </h2>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {permissions.can_manage_members
              ? t("accessEdit")
              : t("accessHidden")}
          </span>
        </div>
        {permissions.can_manage_members ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("sectionFamilyManagementDescription")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("sectionFamilyManagementRestricted")}
          </p>
        )}
      </section>
    </div>
  );
}
