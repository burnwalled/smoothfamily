"use client";

// Medicine: what each member (or pet) takes and when, today's doses to tick off, and courses with
// an end date. Private by design: an adult's own medicines are only shown to that adult. The
// children's and the pets' are set up in the family's settings (Safety); in the app each member adds
// their own and ticks off the doses. The pencil changes one afterwards – dose, times, the points (3.5.1).
import { useState } from "react";
import { Check, Pencil, Pill, Plus, Trash2 } from "lucide-react";
import { api, Medication, Member, Pet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import SettingsLink from "@/components/SettingsLink";

// `id` and `forName`: changing a medicine that exists (who takes it doesn't change).
type Form = { id?: string; forName?: string; owner: string; name: string; dose: string; times: string; end: string; alert: boolean; points: number };
const EMPTY: Form = { owner: "", name: "", dose: "", times: "08:00", end: "", alert: true, points: 5 };

/** `manage`: the family's settings (the children's and the pets'); `mine`: my own, in the profile. */
// `only`: just this member's medicines (their page in the family's settings, 3.0.4).
// `pets`: just the pets' (the family's settings → Everyday, 3.0.4).
export default function Medicine({ manage = false, mine = false, only, pets: petsOnly = false }: { manage?: boolean; mine?: boolean; only?: string; pets?: boolean }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  // The children's and the pets' medicines are added in the family's settings.
  const isAdult = me.role !== "child" && manage;
  const mayManage = me.role === "admin" || !!me.can_manage_family;
  // From the cache: what is added or taken here, or elsewhere in the family, refreshes it.
  const meds = useApi<Medication[]>("/api/medicine").data ?? NONE;
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const pets = useApi<Pet[]>(me.apps.includes("pets") ? "/api/pets" : null).data ?? NONE;
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");


  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      return false;
    }
  }

  // Who a medicine can be added for: yourself; adults also the children and the pets.
  const owners = [
    { value: `user:${me.id}`, label: t("medicine.forMe") },
    ...(isAdult ? members.filter((m) => m.role === "child").map((m) => ({ value: `user:${m.id}`, label: m.display_name })) : []),
    ...(isAdult ? pets.map((p) => ({ value: `pet:${p.id}`, label: `🐾 ${p.name}` })) : []),
  ];

  async function save() {
    if (!form) return;
    const [kind, id] = (form.owner || owners[0].value).split(":");
    const body = {
      user_id: kind === "user" ? id : null,
      pet_id: kind === "pet" ? id : null,
      name: form.name.trim(),
      dose: form.dose.trim(),
      times: form.times.split(/[\s,]+/).filter(Boolean),
      end_date: form.end || null,
      alert_adults: form.alert,
      points: form.points,
    };
    const ok = await run(() => (form.id ? api.put(`/api/medicine/${form.id}`, body) : api.post("/api/medicine", body)));
    if (ok) setForm(null);
  }

  function editForm(m: Medication): Form {
    return {
      id: m.id,
      forName: m.for_name,
      owner: m.pet_id ? `pet:${m.pet_id}` : `user:${m.user_id}`,
      name: m.name,
      dose: m.dose,
      times: m.times.join(", "),
      end: m.end_date ?? "",
      alert: m.alert_adults,
      points: m.points,
    };
  }

  const fmt = (iso: string) => new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  // The profile shows my own; the settings the children's and the pets' (and my own, if I'm a child).
  const shown = petsOnly ? meds.filter((m) => m.pet_id) : only ? meds.filter((m) => m.user_id === only) : mine ? meds.filter((m) => m.user_id === me.id) : manage ? meds.filter((m) => m.as_tasks || m.user_id === me.id) : meds;
  const groups = [...new Set(shown.map((m) => m.for_name))];
  const ownerValue = form ? form.owner || owners[0].value : "";
  const asTasks = !ownerValue.startsWith(`user:${me.id}`) || me.role === "child";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {manage || mine ? (
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{mine ? t("medicine.mine") : petsOnly ? t("medicine.pets") : t("nav.medicine")}</h2>
        ) : (
          <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Pill className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
            {t("nav.medicine")}
          </h1>
        )}
        {!form && (
          <button className="btn-primary" onClick={() => setForm(only ? { ...EMPTY, owner: `user:${only}` } : petsOnly && pets[0] ? { ...EMPTY, owner: `pet:${pets[0].id}` } : EMPTY)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("medicine.add")}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{mine ? t("medicine.mineHint") : t("medicine.asTasksHint")}</p>
      {!manage && !mine && mayManage && <SettingsLink href="/settings/members" />}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {form && (
        <section className="card mt-4 space-y-3 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="med-owner">{t("medicine.forWhom")}</label>
              {form.id ? (
                <input id="med-owner" className="input" value={form.forName} readOnly disabled />
              ) : (
                <select id="med-owner" className="input" value={form.owner || owners[0].value} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                  {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="label" htmlFor="med-name">{t("medicine.name")}</label>
              <input id="med-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("medicine.namePh")} />
            </div>
            <div>
              <label className="label" htmlFor="med-dose">{t("medicine.dose")}</label>
              <input id="med-dose" className="input" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder={t("medicine.dosePh")} />
            </div>
            <div>
              <label className="label" htmlFor="med-times">{t("medicine.times")}</label>
              <input id="med-times" className="input" value={form.times} onChange={(e) => setForm({ ...form, times: e.target.value })} placeholder="08:00, 20:00" />
            </div>
            <div>
              <label className="label" htmlFor="med-end">{t("medicine.endDate")}</label>
              <input id="med-end" className="input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              <p className="mt-1 text-xs text-muted">{t("medicine.endHint")}</p>
            </div>
            <label className="flex items-start gap-2 self-center text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={form.alert} onChange={(e) => setForm({ ...form, alert: e.target.checked })} />
              <span>{t("medicine.alert")}</span>
            </label>
            {asTasks && (
              <div>
                <label className="label" htmlFor="med-points">{t("medicine.points")}</label>
                <input id="med-points" className="input w-24" type="number" min={0} max={100} value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) || 0 })} />
                <p className="mt-1 text-xs text-muted">{t("medicine.pointsHint")}</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={!form.name.trim() || !form.times.trim()}>{form.id ? t("common.save") : t("common.add")}</button>
            <button className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </section>
      )}

      {shown.length === 0 && !form && <p className="mt-6 text-sm text-muted">{t("medicine.empty")}</p>}
      {groups.map((who) => (
        <section key={who} className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{who}</h2>
          <ul className="space-y-2">
            {shown.filter((m) => m.for_name === who).map((m) => (
              <li key={m.id} className={`card p-4 ${m.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{m.name}{m.dose ? <span className="font-normal text-muted"> · {m.dose}</span> : null}</p>
                    <p className="text-xs text-muted">
                      {m.times.join(", ")}
                      {m.end_date ? ` · ${t("medicine.until", { date: new Date(`${m.end_date}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }) })}` : ""}
                      {!m.active ? ` · ${t("medicine.paused")}` : ""}
                      {m.as_tasks ? ` · ${t("medicine.asTask", { points: m.points })}` : ""}
                    </p>
                  </div>
                  {m.can_edit && (
                    <span className="flex gap-1">
                      <button className="rounded px-2 py-1 text-muted hover:bg-base hover:text-ink" onClick={() => { setForm(editForm(m)); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`${t("common.edit")}: ${m.name}`} title={t("common.edit")}>
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => api.post(`/api/medicine/${m.id}/stop`))}>
                        {m.active ? t("medicine.pause") : t("medicine.resume")}
                      </button>
                      <button className="rounded px-2 py-1 text-red-700 hover:bg-base" onClick={() => confirm(t("common.confirmRemove", { name: m.name })) && run(() => api.del(`/api/medicine/${m.id}`))} aria-label={t("common.remove")}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </span>
                  )}
                </div>
                {m.today.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("medicine.today")}>
                    {m.today.map((d) => (
                      <button
                        key={d.scheduled_at}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm ${d.taken_at ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}
                        onClick={() => run(() => api.post(`/api/medicine/${m.id}/take`, { scheduled_at: d.scheduled_at }))}
                        // A child's or a pet's dose is ticked off among the tasks.
                        disabled={m.as_tasks}
                        aria-pressed={!!d.taken_at}
                      >
                        {d.taken_at && <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
                        {d.time}
                        {d.taken_at && <span className="text-xs font-normal text-muted">{t("medicine.takenBy", { name: d.taken_by_name ?? "", time: fmt(d.taken_at) })}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
