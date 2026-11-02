"use client";

// Family settings → Security: the sign-in rules (set by the server admin for every family, 2.8.2)
// and, for a hosted family, what the server's admin has done with it.
import { CircleCheck } from "lucide-react";
import { api, ServerLogRow } from "@/lib/api";
import { useMe } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type Policy = { passkeys_enabled: boolean; totp_policy: "off" | "optional" | "required" };

export default function SecuritySettingsPage() {
  const { t } = useI18n();
  const hosted = useMe().family_kind === "hosted";
  const policy = useApi<Policy>("/api/auth/security").data ?? null;

  return (
    <>
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("security.title")}</h2>
        <p className="mb-3 text-xs text-muted">{t("security.byServer")}</p>
        {!policy ? (
          <p className="text-xs text-muted">{t("common.loading")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <CircleCheck className={`h-4 w-4 ${policy.passkeys_enabled ? "text-green-700" : "text-muted"}`} aria-hidden />
              {policy.passkeys_enabled ? t("security.passkeysOn") : t("security.passkeysOff")}
            </li>
            <li className="flex items-center gap-2">
              <CircleCheck className={`h-4 w-4 ${policy.totp_policy !== "off" ? "text-green-700" : "text-muted"}`} aria-hidden />
              {t("security.totpPolicy")}: {t(`security.totp.${policy.totp_policy}` as "security.totp.off")}
            </li>
          </ul>
        )}
      </section>
      {hosted && <ServerLogForFamily />}
    </>
  );
}

// For a family hosted on someone else's server: everything the server's admin has done with it.
function ServerLogForFamily() {
  const { t, dateLocale } = useI18n();
  const query = useApi<ServerLogRow[]>("/api/server/log/mine");
  const rows = query.data ?? (query.isError ? NONE : null);
  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("server.familyLogTitle")}</h2>
      <p className="mb-3 text-xs text-muted">{t("server.familyLogHint")}</p>
      {!rows ? null : rows.length === 0 ? (
        <p className="text-sm text-muted">{t("server.logEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="w-28 shrink-0 text-muted">{new Date(r.created_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span>{t(`server.action.${r.action}` as Parameters<typeof t>[0])}{r.actor_name ? ` · ${r.actor_name}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
