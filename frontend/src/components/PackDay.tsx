"use client";

// The day it's time to pack (2.9.0), for a trip or a calendar event: an adult picks the day and who
// packs, and each of them gets a task that day – with the points it's worth.
import { useState } from "react";
import { Backpack, Check } from "lucide-react";
import { Member, PackTask } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Save = (body: { day: string | null; member_ids: string[]; points: number }) => Promise<unknown>;

export default function PackDay({
  tasks, candidates, defaultIds, defaultDay, lastDay, onSave,
}: { tasks: PackTask[]; candidates: Member[]; defaultIds: string[]; defaultDay: string; lastDay: string; onSave: Save }) {
  const { t, dateLocale } = useI18n();
  const [form, setForm] = useState<{ day: string; ids: string[]; points: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (id: string | null) => candidates.find((m) => m.id === id)?.display_name ?? "";
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  async function save(body: Parameters<Save>[0]) {
    setBusy(true);
    try {
      await onSave(body);
      setForm(null);
    } finally {
      setBusy(false);
    }
  }

  if (form) {
    return (
      <div className="space-y-2 rounded-lg border border-edge p-3 text-sm" role="group" aria-label={t("packDay.title")}>
        <label className="block text-xs text-muted">
          {t("packDay.day")}
          <input type="date" className="input mt-1 w-auto" value={form.day} max={lastDay} onChange={(e) => setForm({ ...form, day: e.target.value })} />
        </label>
        <div>
          <p className="text-xs text-muted">{t("packDay.who")}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {candidates.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-700"
                  checked={form.ids.includes(m.id)}
                  onChange={(e) => setForm({ ...form, ids: e.target.checked ? [...form.ids, m.id] : form.ids.filter((id) => id !== m.id) })}
                />
                {m.display_name}
              </label>
            ))}
          </div>
        </div>
        <label className="block text-xs text-muted">
          {t("packDay.points")}
          <input type="number" min={0} max={100} className="input mt-1 w-24" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) || 0 })} />
        </label>
        <p className="text-xs text-muted">{t("packDay.hint")}</p>
        <div className="flex gap-2">
          <button className="btn-primary px-3 py-1 text-xs" disabled={busy || !form.day || !form.ids.length} onClick={() => save({ day: form.day, member_ids: form.ids, points: form.points })}>
            {t("profile.save")}
          </button>
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setForm(null)}>{t("common.cancel")}</button>
        </div>
      </div>
    );
  }

  const open = tasks.filter((x) => !x.done);
  const ids = [...new Set(tasks.map((x) => x.user_id).filter((id): id is string => !!id))];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Backpack className="h-4 w-4 text-muted" aria-hidden />
      {tasks.length ? (
        <>
          <span>
            {t("packDay.summary", { day: day(tasks[0].day ?? defaultDay) })}{" "}
            {tasks.map((x) => (
              <span key={x.task_id} className={`mr-1 inline-flex items-center gap-0.5 ${x.done ? "text-muted" : "font-semibold"}`}>
                {x.done && <Check className="h-3.5 w-3.5" aria-hidden />}
                {name(x.user_id)}
              </span>
            ))}
          </span>
          {open.length > 0 && (
            <>
              <button className="text-xs text-accent hover:underline" onClick={() => setForm({ day: tasks[0].day ?? defaultDay, ids, points: 10 })}>{t("packDay.change")}</button>
              <button className="text-xs text-muted hover:text-red-700" disabled={busy} onClick={() => save({ day: null, member_ids: [], points: 0 })}>{t("packDay.remove")}</button>
            </>
          )}
        </>
      ) : (
        <button className="btn-ghost border border-edge px-2 py-1 text-xs" onClick={() => setForm({ day: defaultDay, ids: defaultIds, points: 10 })}>
          {t("packDay.choose")}
        </button>
      )}
    </div>
  );
}
