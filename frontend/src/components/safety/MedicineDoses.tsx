"use client";

// An adult's own medicine doses today (2.9.0): private, so not tasks and no points – a child's and a
// pet's doses are real tasks. Set up under My profile.
import { Check, Pill } from "lucide-react";
import { api, Medication } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";

export default function MedicineDoses() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const allowed = me.apps.includes("medicine");
  const meds = useApi<Medication[]>(allowed ? "/api/medicine" : null).data ?? NONE;

  const due = meds.filter((m) => m.active && m.today.length > 0);
  if (!allowed || due.length === 0) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });

  async function take(med: Medication, scheduledAt: string) {
    await api.post(`/api/medicine/${med.id}/take`, { scheduled_at: scheduledAt }).catch(() => {});
  }

  return (
    <section className="card mt-4 p-5" aria-label={t("medicine.today")}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <Pill className="h-4 w-4" aria-hidden />
        {t("medicine.today")}
      </h2>
      <ul className="space-y-3">
        {due.map((m) => (
          <li key={m.id}>
            <p className="text-sm font-semibold">
              {m.name}
              {m.dose ? <span className="font-normal text-muted"> · {m.dose}</span> : null}
              {m.user_id !== me.id && <span className="font-normal text-muted"> · {m.for_name}</span>}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {m.today.map((d) => (
                <button
                  key={d.scheduled_at}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${d.taken_at ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}
                  onClick={() => take(m, d.scheduled_at)}
                  aria-pressed={!!d.taken_at}
                  aria-label={t("medicine.takeDose", { name: m.name, time: d.time })}
                >
                  {d.taken_at && <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
                  {d.time}
                  {d.taken_at && <span className="text-xs font-normal text-muted">{t("medicine.takenBy", { name: d.taken_by_name ?? "", time: fmt(d.taken_at) })}</span>}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
