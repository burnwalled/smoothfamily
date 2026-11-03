"use client";

// Fetch my health from Home Assistant (3.4.0): the person's own yes – in their profile and on their
// Health page (and, for a child, on the child's page in the family's settings). Shows what the
// family admin has linked, when it was last fetched, and "Fetch now".
import { useState } from "react";
import { HeartPulse, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";
import { HEALTH_METRICS } from "./metrics";

type Import = {
  available: boolean;
  accounts: { entry: string; label: string; title: string }[];
  metrics: string[];
  on: boolean;
  synced_at: string | null;
  taken: number | null;
};

export default function HealthImport({ userId, bare = false }: { userId: string; bare?: boolean }) {
  const { t, dateLocale } = useI18n();
  const path = `/api/health/people/${userId}/import`;
  const state = useApi<Import>(path).data;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!state?.available) return null;
  const linked = state.metrics.length > 0;

  async function run(action: () => Promise<Import>) {
    setBusy(true);
    setNote("");
    try {
      const done = await action();
      if (done.taken != null) setNote(t("health.ha.taken", { n: done.taken }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-2">
      {!linked ? (
        <p className="text-sm text-muted">{t("health.import.notLinked")}</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {t("health.import.from", {
              accounts: state.accounts.length ? state.accounts.map((a) => `${a.label} · ${a.title}`).join(", ") : t("health.import.sensors"),
              metrics: state.metrics.map((m) => t(HEALTH_METRICS.find(([k]) => k === m)?.[1] ?? "health.steps").toLowerCase()).join(", "),
            })}
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" disabled={busy} checked={state.on} onChange={(e) => {
              const on = e.target.checked;
              setApiData<Import>(path, (old) => (old ? { ...old, on } : old));
              void run(() => api.put<Import>(path, { on }));
            }} />
            <span>
              {t("health.import.on")}
              <span className="block text-xs text-muted">{t("health.import.help")}</span>
            </span>
          </label>
          {state.on && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button className="btn-ghost flex items-center gap-1.5 px-2" disabled={busy} onClick={() => run(() => api.post<Import>(`/api/health/people/${userId}/sync`))}>
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
                {t("health.ha.syncNow")}
              </button>
              {state.synced_at && (
                <span className="text-xs text-muted">{t("health.ha.synced", { time: new Date(state.synced_at).toLocaleString(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })}</span>
              )}
            </div>
          )}
        </>
      )}
      {note && <p className="text-xs font-semibold" role="status">{note}</p>}
    </div>
  );
  if (bare) return body;
  return (
    <section className="card space-y-2 p-5" aria-label={t("health.ha.title")}>
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <HeartPulse className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("health.ha.title")}
      </h3>
      {body}
    </section>
  );
}
