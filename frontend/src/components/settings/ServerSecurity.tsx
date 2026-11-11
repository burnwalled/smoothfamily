"use client";

// Server settings → Security (2.8.2): passkeys, two-step codes and how long passwords must be – the
// same for every family on the server.
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { COUNTRY_CODES, countryName, flagOf } from "@/lib/countries";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Policy = { passkeys_enabled: boolean; totp_policy: "off" | "optional" | "required"; password_min_adult: number; password_min_child: number; signin_countries: string[] };
type Event = { id: string; kind: string; username: string; name: string | null; family: string | null; ip: string; country: string | null; detail: string; created_at: string };
type Geo = { loaded: boolean; fetched_at: string | null; month: string | null; size: number; attribution: string; attribution_url: string };

// Where sign-ins come from (3.4.1): the country table kept on the server, and the countries sign-ins
// are allowed from – a rule for signing in, never for guests' links.
export function SigninCountries({ policy, save }: { policy: Policy; save: (next: Policy) => Promise<void> }) {
  const { t, locale, dateLocale } = useI18n();
  const geo = useApi<Geo>("/api/admin/geo").data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const chosen = policy.signin_countries ?? [];
  const names = Object.fromEntries(COUNTRY_CODES.map((c) => [countryName(c, locale), c]));
  const fetchTable = async () => {
    setBusy(true);
    setError("");
    try {
      setApiData<Geo>("/api/admin/geo", () => undefined);
      const next = await api.post<Geo>("/api/admin/geo/download");
      setApiData<Geo>("/api/admin/geo", () => next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const add = (name: string) => {
    const code = names[name] ?? (COUNTRY_CODES.includes(name.toUpperCase()) ? name.toUpperCase() : null);
    if (!code || chosen.includes(code)) return;
    setPick("");
    void save({ ...policy, signin_countries: [...chosen, code].sort() });
  };
  return (
    <section className="card mt-4 space-y-3 p-5" aria-label={t("server.geo.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("server.geo.title")}</h2>
      <p className="text-sm text-muted">{t("server.geo.intro")}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1">
          {geo?.loaded
            ? t("server.geo.loaded", { month: geo.month ?? "", date: geo.fetched_at ? new Date(geo.fetched_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "" })
            : t("server.geo.none")}
        </span>
        <button className="btn-ghost border border-edge" disabled={busy} onClick={() => { void fetchTable(); }}>
          {busy ? t("common.loading") : geo?.loaded ? t("server.geo.update") : t("server.geo.download")}
        </button>
      </div>
      {geo && <a className="text-xs text-muted underline" href={geo.attribution_url} target="_blank" rel="noreferrer">{geo.attribution}</a>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div>
        <span className="label">{t("server.geo.countries")}</span>
        <p className="text-xs text-muted">{t("server.geo.countriesHelp")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.length === 0 && <span className="text-sm text-muted">{t("server.geo.anywhere")}</span>}
          {chosen.map((code) => (
            <span key={code} className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-sm">
              <span aria-hidden>{flagOf(code)}</span>
              {countryName(code, locale)}
              <button className="text-muted hover:text-red-700" aria-label={t("server.geo.remove", { name: countryName(code, locale) })} onClick={() => { void save({ ...policy, signin_countries: chosen.filter((c) => c !== code) }); }}>×</button>
            </span>
          ))}
        </div>
        <input
          className="input mt-2 max-w-xs"
          list="signin-countries"
          placeholder={t("server.geo.addCountry")}
          aria-label={t("server.geo.addCountry")}
          value={pick}
          onChange={(e) => { setPick(e.target.value); if (names[e.target.value]) add(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(pick); } }}
        />
        <datalist id="signin-countries">
          {COUNTRY_CODES.filter((c) => !chosen.includes(c)).map((c) => <option key={c} value={countryName(c, locale)} />)}
        </datalist>
      </div>
    </section>
  );
}
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
              {e.ip && <span className="text-muted">{e.country && <span aria-label={e.country} title={e.country}>{flagOf(e.country)} </span>}{e.ip}</span>}
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
    <>
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
    <SigninCountries policy={policy} save={save} />
    </>
  );
}
