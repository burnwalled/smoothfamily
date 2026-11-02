"use client";

// Server settings → Updates (2.9.0): what runs, what newer versions there are of Postgres, Redis,
// Caddy and SearXNG, and when they may be put in – by themselves in a weekly window, or after the
// admin approves. The server's update.sh does the Docker work; every adult on the server is told.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";

type Overview = {
  app_version: string | null;
  connected: boolean;
  state_at: string | null;
  checked_at: string | null;
  running: Record<string, string>;
  available: Record<string, string>;
  planned: { run_id: string; at: string; versions: Record<string, string> } | null;
  last_run: { ok: boolean; at: string; message: string } | null;
  settings: { mode: "auto" | "approve" | "off"; day: number; hour: number };
  next_window: string;
  // Every gateway on the server and the version it reported (3.0.1).
  gateways: {
    latest: string | null;
    items: { family: string; home: string; version: string | null; online: boolean; auto_update: boolean | null; last_seen: string | null; pairing: boolean; up_to_date: boolean }[];
  };
};

const NAMES: Record<string, string> = { db: "PostgreSQL", redis: "Redis", caddy: "Caddy", searxng: "SearXNG" };

export default function ServerUpdates() {
  const { t, dateLocale } = useI18n();
  const [view, setView] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get<Overview>("/api/admin/updates").then(setView).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);
  useEffect(load, [load]);

  async function run(action: () => Promise<Overview>) {
    setBusy(true);
    setError("");
    try {
      setView(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(dateLocale, { weekday: "long", timeZone: "UTC" }));
  const available = Object.entries(view.available);
  const save = (patch: Partial<Overview["settings"]>) => {
    // Shown at once; the server's answer follows.
    setView({ ...view, settings: { ...view.settings, ...patch } });
    return run(() => api.put<Overview>("/api/admin/updates/settings", { ...view.settings, ...patch }));
  };

  return (
    <div className="mt-4 space-y-4">
      <section className="card p-5" aria-label={t("updates.title")}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("updates.title")}</h2>
        <p className="text-sm text-muted">{t("updates.why")}</p>
        {view.app_version && <p className="mt-2 text-sm">{t("updates.appVersion", { version: view.app_version })}</p>}

        {!view.connected ? (
          <p className="mt-3 flex items-start gap-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t("updates.notConnected")}
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-1">{t("updates.software")}</th><th>{t("updates.running")}</th><th>{t("updates.newer")}</th></tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {Object.entries(view.running).map(([name, version]) => (
                <tr key={name}>
                  <td className="py-1.5 font-semibold">{NAMES[name] ?? name}</td>
                  <td className="font-mono text-xs">{version}</td>
                  <td className="font-mono text-xs">{view.available[name] ?? <span className="font-sans text-muted">{t("updates.upToDate")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted">{t("updates.checked", { when: when(view.checked_at) })}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost border border-edge" disabled={busy} onClick={() => run(() => api.post<Overview>("/api/admin/updates/check", {}))}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
            {t("updates.checkNow")}
          </button>
          {available.length > 0 && !view.planned && (
            <>
              <button className="btn-primary" disabled={busy} onClick={() => run(() => api.post<Overview>("/api/admin/updates/approve", {}))}>{t("updates.approveWindow", { when: when(view.next_window) })}</button>
              <button className="btn-ghost border border-edge" disabled={busy} onClick={() => confirm(t("updates.nowConfirm")) && run(() => api.post<Overview>("/api/admin/updates/approve?now=true", {}))}>{t("updates.approveNow")}</button>
            </>
          )}
        </div>

        {view.planned && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded bg-accent-soft/40 p-3 text-sm">
            {t("updates.planned", { when: when(view.planned.at), what: Object.values(view.planned.versions).join(", ") })}
            <button className="text-xs text-red-700 underline" disabled={busy} onClick={() => run(() => api.del(`/api/admin/updates/plan`) as unknown as Promise<Overview>).then(load)}>{t("updates.cancel")}</button>
          </p>
        )}
        {view.last_run && (
          <p className={`mt-3 flex items-start gap-2 text-sm ${view.last_run.ok ? "text-green-800" : "text-red-700"}`}>
            {view.last_run.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            {t(view.last_run.ok ? "updates.lastOk" : "updates.lastFailed", { when: when(view.last_run.at) })} {view.last_run.message}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>

      {view.gateways.items.length > 0 && (
        <section className="card p-5" aria-label={t("updates.gateways")}>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("updates.gateways")}</h2>
          <p className="text-sm text-muted">
            {view.gateways.items.every((g) => g.up_to_date || g.pairing)
              ? t("updates.gatewaysAllCurrent", { version: view.gateways.latest ?? "" })
              : t("updates.gatewaysBehind", { version: view.gateways.latest ?? "" })}
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-1">{t("updates.gatewayHome")}</th><th>{t("updates.running")}</th><th>{t("updates.gatewayStatus")}</th></tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {view.gateways.items.map((g) => (
                <tr key={`${g.family}/${g.home}`}>
                  <td className="py-1.5"><span className="font-semibold">{g.home}</span> <span className="text-xs text-muted">· {g.family}</span></td>
                  <td className={`font-mono text-xs ${g.up_to_date ? "" : "text-amber-700"}`}>{g.version ?? "–"}</td>
                  <td className="text-xs">
                    {g.pairing
                      ? t("homes.waitingForPairing")
                      : `${g.online ? t("homes.online") : t("updates.gatewaySeen", { when: when(g.last_seen) })}${g.auto_update === false ? ` · ${t("updates.gatewayManual")}` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card p-5" aria-label={t("updates.when")}>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("updates.when")}</h2>
        <div className="mt-2 space-y-2 text-sm" role="radiogroup" aria-label={t("updates.when")}>
          {(["approve", "auto", "off"] as const).map((mode) => (
            <label key={mode} className="flex items-start gap-2">
              <input type="radio" name="update-mode" className="mt-1 accent-primary-700" checked={view.settings.mode === mode} onChange={() => save({ mode })} />
              <span>
                <span className="font-semibold">{t(`updates.mode.${mode}` as TranslationKey)}</span>
                <span className="block text-xs text-muted">{t(`updates.mode.${mode}Hint` as TranslationKey)}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {t("updates.window")}
          <select className="input w-auto" value={view.settings.day} onChange={(e) => save({ day: Number(e.target.value) })} aria-label={t("updates.day")}>
            {weekdays.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <select className="input w-auto" value={view.settings.hour} onChange={(e) => save({ hour: Number(e.target.value) })} aria-label={t("updates.hour")}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
          </select>
        </div>
        <p className="mt-2 text-xs text-muted">{t("updates.told")}</p>
        <p className="mt-1 text-xs text-muted">{t("updates.ownImages")}</p>
      </section>
    </div>
  );
}
