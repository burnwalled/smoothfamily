"use client";

// Server settings → Security (2.8.2): passkeys, two-step codes and how long passwords must be – the
// same for every family on the server.
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Policy = { passkeys_enabled: boolean; totp_policy: "off" | "optional" | "required"; password_min_adult: number; password_min_child: number };
type Event = { id: string; kind: string; username: string; name: string | null; family: string | null; ip: string; detail: string; created_at: string };
type Overview = { day: Record<string, number>; week: Record<string, number>; events: Event[] };
const SUMMARY = ["login_failed", "throttled", "link_invalid", "new_device"] as const;

// The security log (3.4.1): what's worth knowing about who tried to get in, the last 30 days.
export function SecurityLog() {
  const { t, dateLocale } = useI18n();
  const view = useApi<Overview>("/api/server/security").data;
  const kind = (k: string) => t(`server.security.kind.${k}` as TranslationKey);
  if (!view) return null;
  return (
    <section className="card mt-4 space-y-3 p-5" aria-label={t("server.security.log")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("server.security.log")}</h2>
      <p className="text-sm text-muted">{t("server.security.intro")}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {SUMMARY.map((k) => (
          <div key={k} className="rounded-lg border border-edge p-2">
            <dt className="text-xs text-muted">{kind(k)}</dt>
            <dd className="font-semibold">{t("server.security.counts", { day: view.day[k] ?? 0, week: view.week[k] ?? 0 })}</dd>
          </div>
        ))}
      </dl>
      {view.events.length === 0 ? (
        <p className="text-sm text-muted">{t("server.security.empty")}</p>
      ) : (
        <ul className="divide-y divide-edge text-xs [overflow-wrap:anywhere]">
          {view.events.slice(0, 150).map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
              <span className="w-28 shrink-0 text-muted">{new Date(e.created_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="font-semibold">{kind(e.kind)}</span>
              {(e.name || e.username) && <span>{e.name ? `${e.name} (${e.username})` : e.username}</span>}
              {e.family && <span className="rounded-full border border-edge px-2 text-muted">{e.family}</span>}
              {e.ip && <span className="text-muted">{e.ip}</span>}
              {e.detail && <span className="text-muted">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ServerSecurity() {
  const { t } = useI18n();
  const policy = useApi<Policy>("/api/admin/security-policy").data ?? null;
  const setPolicy = (next: Policy) => setApiData<Policy>("/api/admin/security-policy", () => next);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(next: Policy) {
    setError("");
    setSaved(false);
    setPolicy(next);
    try {
      setPolicy(await api.put<Policy>("/api/admin/security-policy", next));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!policy) return <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>;
  const length = (key: "password_min_adult" | "password_min_child", label: string) => (
    <label className="block text-sm">
      {label}
      <select className="input mt-1" value={policy[key]} onChange={(e) => save({ ...policy, [key]: Number(e.target.value) })}>
        {[4, 6, 8, 10, 12, 14, 16].map((n) => (
          <option key={n} value={n}>
            {t(n === 12 ? "server.passwordRecommended" : "server.passwordChars", { n })}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="card mt-4 space-y-4 p-5" aria-label={t("server.tab.security")}>
      <p className="text-sm text-muted">{t("server.securityIntro")}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={policy.passkeys_enabled} onChange={(e) => save({ ...policy, passkeys_enabled: e.target.checked })} />
        <span>
          <span className="font-medium">{t("security.allowPasskeys")}</span>
          <span className="block text-xs text-muted">{t("security.allowPasskeysHint")}</span>
        </span>
      </label>
      <div className="max-w-sm">
        <label className="label" htmlFor="server-totp">{t("security.totpPolicy")}</label>
        <select id="server-totp" className="input" value={policy.totp_policy} onChange={(e) => save({ ...policy, totp_policy: e.target.value as Policy["totp_policy"] })}>
          <option value="off">{t("security.totp.off")}</option>
          <option value="optional">{t("security.totp.optional")}</option>
          <option value="required">{t("security.totp.required")}</option>
        </select>
        <p className="mt-1 text-xs text-muted">{t("security.totpPolicyHint")}</p>
      </div>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {length("password_min_adult", t("server.passwordAdults"))}
        {length("password_min_child", t("server.passwordChildren"))}
      </div>
      <p className="text-xs text-muted">{t("server.passwordHint")}</p>
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-green-700" role="status">
          <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("home.saved")}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
