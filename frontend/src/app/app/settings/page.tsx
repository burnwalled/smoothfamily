"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type SettingsPermissions = {
  can_manage_settings: boolean;
  can_manage_members: boolean;
  can_manage_calendar_integrations: boolean;
};

type FamilyOverview = {
  current_user_role: string;
  permissions: SettingsPermissions;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { isSignedIn, getToken } = useAuth();

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("rbacRoleLabel")}: {overview.current_user_role}</p>
      </section>

      <section className="portal-card">
        <h2 className="text-base font-semibold">{t("sectionProfile")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("sectionProfileDescription")}</p>
      </section>

      <section className="portal-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("sectionCalendarIntegrations")}</h2>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {permissions.can_manage_calendar_integrations ? t("accessEdit") : t("accessViewOnly")}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("sectionCalendarIntegrationsDescription")}</p>
      </section>

      <section className="portal-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("sectionFamilyManagement")}</h2>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {permissions.can_manage_members ? t("accessEdit") : t("accessHidden")}
          </span>
        </div>
        {permissions.can_manage_members ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("sectionFamilyManagementDescription")}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("sectionFamilyManagementRestricted")}</p>
        )}
      </section>
    </div>
  );
}
