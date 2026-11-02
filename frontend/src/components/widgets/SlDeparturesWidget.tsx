"use client";

// Live departures for one SL stop/station (Trafiklab SL Transport API,
// proxied and cached by the backend). A user can add several of these,
// one per stop they care about.
import { useCallback, useEffect, useState } from "react";
import { Bus, CarTaxiFront, LucideIcon, Ship, TrainFront, TrainFrontTunnel, TramFront } from "lucide-react";
import { api, SlDeparture } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const MODE_ICONS: Record<string, LucideIcon> = {
  BUS: Bus,
  METRO: TrainFrontTunnel,
  TRAM: TramFront,
  TRAIN: TrainFront,
  FERRY: Ship,
  SHIP: Ship,
  TAXI: CarTaxiFront,
};

const REFRESH_MS = 60_000;

export default function SlDeparturesWidget({ siteId }: { siteId: number }) {
  const { t, dateLocale } = useI18n();
  const [departures, setDepartures] = useState<SlDeparture[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api
      .live<SlDeparture[]>(`/api/transit/sl/departures?site_id=${siteId}`, (deps) => {
        // Cached departures may include ones that have left; the fresh answer follows.
        setDepartures(deps.filter((d) => new Date(d.expected).getTime() > Date.now() - 60_000));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [siteId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  function timeLabel(expected: string): string {
    const minutes = Math.round((new Date(expected).getTime() - Date.now()) / 60_000);
    if (minutes <= 0) return t("sl.now");
    if (minutes > 60) {
      return new Date(expected).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
    }
    return t("sl.min", { m: minutes });
  }

  // Departures already on screen stay while SL is unreachable; the note says why.
  if (failed && !departures?.length) return <p className="text-sm text-muted">{t("sl.error")}</p>;
  if (departures === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (departures.length === 0) return <p className="text-sm text-muted">{t("sl.noDepartures")}</p>;
  const note = failed ? t("sl.error") : departures.some((d) => d.stale) ? t("sl.stale") : null;

  return (
    <>
      <ul className="space-y-1.5">
        {departures.slice(0, 6).map((dep, i) => {
          const ModeIcon = MODE_ICONS[dep.transport_mode] ?? Bus;
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <ModeIcon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-label={dep.transport_mode} />
              <span className="min-w-[2.5rem] rounded bg-primary-800 px-1.5 py-0.5 text-center text-xs font-bold text-primary-100">
                {dep.line}
              </span>
              <span className="flex-1 truncate">{dep.destination}</span>
              <span className={`text-sm font-bold ${dep.state === "CANCELLED" ? "text-red-600 line-through" : "text-ink"}`}>
                {timeLabel(dep.expected)}
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </>
  );
}
