"use client";

// Family settings → a member → Health from Home Assistant (3.4.0): the family admin links the
// member's health accounts – their phone with the companion app, their Withings user, their Garmin –
// and, where needed, a sensor of their own per metric. Nothing is fetched until the member turns it
// on in their profile (an adult may, for a child: the switch is here too).
import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import HealthImport from "./HealthImport";
import { HEALTH_METRICS } from "./metrics";

type Sensor = { entity_id: string; name: string; state: string | null; unit: string | null };
type Account = { entry: string; domain: string; title: string; label: string; metrics: Record<string, Sensor[]>; linked_to: string | null };
type Links = {
  available: boolean;
  reachable: boolean;
  accounts_known: boolean;
  accounts: Account[];
  linked: string[];
  chosen: Record<string, string>;
  candidates: Record<string, Sensor[]>;
  import_on: boolean;
};

// A workout calendar or activities sensor has no number worth showing.
const sensorText = (s: Sensor, metric?: string) => (metric === "workouts" || s.state == null ? s.name : `${s.name} · ${s.state}${s.unit ? ` ${s.unit}` : ""}`);

export default function HealthLinks({ memberId, name, child }: { memberId: string; name: string; child: boolean }) {
  const { t } = useI18n();
  const path = `/api/health/links/${memberId}`;
  const links = useApi<Links>(path).data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!links?.available) return null;

  async function save(accounts: string[], chosen: Record<string, string | null> = {}) {
    setBusy(true);
    setError("");
    try {
      await api.put(path, { accounts, chosen });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const metrics = HEALTH_METRICS.filter(([m]) => m in links.candidates);
  // Each metric's own choice is kept when the accounts change; the rest follow the accounts.
  const own = (except?: string) => Object.fromEntries(metrics.map(([m]) => [m, links.chosen[m] ?? null]).filter(([m]) => m !== except));
  // The box follows at once; the server's answer (with the metrics mapped) replaces it.
  const toggle = (entry: string, on: boolean) => {
    const linked = on ? [...links.linked, entry] : links.linked.filter((e) => e !== entry);
    setApiData<Links>(path, (old) => (old ? { ...old, linked } : old));
    return save(linked);
  };

  return (
    <section className="card space-y-3 p-5" aria-label={t("health.links.title")}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <HeartPulse className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("health.links.title")}
      </h2>
      <p className="text-xs text-muted">{t(child ? "health.links.helpChild" : "health.links.help", { name })}</p>
      {!links.reachable && <p className="text-sm text-red-700">{t("health.ha.unreachable")}</p>}

      {links.accounts_known && links.accounts.length > 0 && (
        <div role="group" aria-label={t("health.links.accounts")}>
          <span className="label">{t("health.links.accounts")}</span>
          <ul className="space-y-1.5">
            {links.accounts.map((a) => (
              <li key={a.entry}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" disabled={busy} checked={links.linked.includes(a.entry)} onChange={(e) => toggle(a.entry, e.target.checked)} />
                  <span>
                    <span className="font-semibold">{a.label}</span> · {a.title}
                    {a.linked_to && <span className="ml-1 rounded-full bg-base px-2 py-0.5 text-xs text-muted">{t("health.links.linkedTo", { name: a.linked_to })}</span>}
                    <span className="block text-xs text-muted">{Object.keys(a.metrics).map((m) => t(HEALTH_METRICS.find(([k]) => k === m)?.[1] ?? "health.steps")).join(", ")}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {links.reachable && !links.accounts_known && <p className="text-xs text-muted">{t("health.links.noAccounts")}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map(([m, label]) => {
          const chosen = links.chosen[m] ?? "";
          // The linked accounts' sensors first, then any other that could be it.
          const mine = links.accounts.filter((a) => links.linked.includes(a.entry)).flatMap((a) => a.metrics[m] ?? []);
          const rest = (links.candidates[m] ?? []).filter((s) => !mine.some((x) => x.entity_id === s.entity_id));
          return (
            <label key={m}>
              <span className="label">{t(label)}</span>
              <select className="input" value={chosen} disabled={busy} onChange={(e) => save(links.linked, { ...own(m), [m]: e.target.value || null })}>
                <option value="">{t("health.ha.none")}</option>
                {chosen && ![...mine, ...rest].some((s) => s.entity_id === chosen) && <option value={chosen}>{chosen}</option>}
                {mine.map((s) => <option key={s.entity_id} value={s.entity_id}>{sensorText(s, m)}</option>)}
                {rest.length > 0 && (
                  <optgroup label={t("health.links.otherSensors")}>
                    {rest.map((s) => <option key={s.entity_id} value={s.entity_id}>{sensorText(s, m)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {/* An adult turns it on for a child; an adult turns it on themselves, in their profile. */}
      {child ? <HealthImport userId={memberId} bare /> : <p className="text-xs text-muted">{t(links.import_on ? "health.links.isOn" : "health.links.isOff", { name })}</p>}
    </section>
  );
}
