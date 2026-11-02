"use client";

// Server admin: backups of the whole server (database + media, like backup.sh) – make one now,
// download, remove, and the daily schedule. Hidden for everyone else (the API answers 403).
import { useCallback, useEffect, useState } from "react";
import { Download, HardDriveDownload, Trash2 } from "lucide-react";
import { api, BackupsOverview } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function size(bytes: number): string {
  if (bytes <= 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function BackupsPanel() {
  const { t, dateLocale } = useI18n();
  const [data, setData] = useState<BackupsOverview | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<BackupsOverview>("/api/admin/backups")
      .then(setData)
      .catch((e) => (e?.status === 403 ? setForbidden(true) : setError(e instanceof Error ? e.message : t("common.error"))));
  }, [t]);

  useEffect(load, [load]);
  // While a backup runs, look again every few seconds.
  useEffect(() => {
    if (!data?.running) return;
    const timer = window.setTimeout(load, 3000);
    return () => window.clearTimeout(timer);
  }, [data, load]);

  async function run(action: () => Promise<BackupsOverview>) {
    setError("");
    try {
      setData(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (forbidden) return null;
  if (!data) return <section className="card mt-4 p-5"><p className="text-xs text-muted">{t("common.loading")}</p></section>;

  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const schedule = data.schedule;

  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <HardDriveDownload className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("backups.title")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("backups.desc")}</p>

      {!data.available ? (
        <p className="text-sm text-muted">{t("backups.unavailable")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={() => run(() => api.post<BackupsOverview>("/api/admin/backups"))} disabled={data.running}>
              {data.running ? t("backups.running") : t("backups.now")}
            </button>
            {data.error && <span className="text-sm text-red-700">{t("backups.failed", { msg: data.error })}</span>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={schedule.enabled}
                onChange={(e) => run(() => api.put<BackupsOverview>("/api/admin/backups/schedule", { ...schedule, enabled: e.target.checked }))}
              />
              {t("backups.daily")}
            </label>
            <select
              className="input w-auto"
              value={schedule.hour}
              disabled={!schedule.enabled}
              onChange={(e) => run(() => api.put<BackupsOverview>("/api/admin/backups/schedule", { ...schedule, hour: Number(e.target.value) }))}
              aria-label={t("backups.hour")}
            >
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
            <select
              className="input w-auto"
              value={schedule.keep_days}
              onChange={(e) => run(() => api.put<BackupsOverview>("/api/admin/backups/schedule", { ...schedule, keep_days: Number(e.target.value) }))}
              aria-label={t("backups.keep")}
            >
              {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{t("backups.keepDays", { n: d })}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={schedule.families}
                disabled={!schedule.enabled}
                onChange={(e) => run(() => api.put<BackupsOverview>("/api/admin/backups/schedule", { ...schedule, families: e.target.checked }))}
              />
              {t("backups.perFamily")}
            </label>
            <select
              className="input w-auto"
              value={schedule.family_keep}
              disabled={!schedule.enabled || !schedule.families}
              onChange={(e) => run(() => api.put<BackupsOverview>("/api/admin/backups/schedule", { ...schedule, family_keep: Number(e.target.value) }))}
              aria-label={t("backups.perFamilyKeep")}
            >
              {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{t("backups.keepNights", { n })}</option>)}
            </select>
            <p className="w-full text-xs text-muted">{t("backups.perFamilyHint")}</p>
          </div>

          {data.backups.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t("backups.none")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
              {data.backups.map((b) => (
                <li key={b.stamp} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-36 flex-1 font-medium">{when(b.created_at)}</span>
                  {b.database && (
                    <a className="btn-ghost px-2 py-1 text-xs" href={`/api/admin/backups/files/${b.database}`} download>
                      <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {t("backups.database")} · {size(b.database_size)}
                    </a>
                  )}
                  {b.media && (
                    <a className="btn-ghost px-2 py-1 text-xs" href={`/api/admin/backups/files/${b.media}`} download>
                      <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {t("backups.media")} · {size(b.media_size)}
                    </a>
                  )}
                  {data.backups.length > 1 && (
                    <button
                      className="text-muted hover:text-red-700"
                      onClick={() => confirm(t("backups.removeConfirm", { when: when(b.created_at) })) && run(() => api.del(`/api/admin/backups/${b.stamp}`) as unknown as Promise<BackupsOverview>)}
                      aria-label={t("common.remove")}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">{t("backups.offsite")}</p>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
