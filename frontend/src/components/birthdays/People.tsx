"use client";

// Whose birthdays the family keeps (2.8.2) – since 3.0.4 under Family members as "Other people":
// grandma, friends and others without an account (a member's birthday is on their own page). Their
// wish lists and the gift planning live in Lists.
import { useState } from "react";
import { Cake } from "lucide-react";
import { api, Member, Person } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type PersonForm = { name: string; user_id: string; month: string; day: string; year: string };
const EMPTY: PersonForm = { name: "", user_id: "", month: "", day: "", year: "" };

/** "Today", "Tomorrow", "In 12 days" … */
export function when(p: Person, t: ReturnType<typeof useI18n>["t"]): string {
  if (p.days_until === null) return t("birthdays.noDate");
  if (p.days_until === 0) return t("birthdays.today");
  if (p.days_until === 1) return t("birthdays.tomorrow");
  return t("birthdays.inDays", { n: p.days_until });
}

export default function People({ others = false }: { others?: boolean } = {}) {
  const { t, dateLocale } = useI18n();
  const everyone = useApi<Person[]>("/api/birthdays/people").data ?? NONE;
  const people = others ? everyone.filter((p) => !p.user_id) : everyone;
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [form, setForm] = useState<PersonForm>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");


  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(dateLocale, { month: "long" });
  const dateText = (p: Person) =>
    p.birth_month && p.birth_day ? `${p.birth_day} ${monthName(p.birth_month)}${p.birth_year ? ` ${p.birth_year}` : ""}` : "";

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      user_id: p.user_id ?? "",
      month: p.birth_month ? String(p.birth_month) : "",
      day: p.birth_day ? String(p.birth_day) : "",
      year: p.birth_year ? String(p.birth_year) : "",
    });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function savePerson() {
    const body = {
      name: form.name.trim(),
      user_id: form.user_id || null,
      birth_month: form.month ? Number(form.month) : null,
      birth_day: form.day ? Number(form.day) : null,
      birth_year: form.year ? Number(form.year) : null,
    };
    await run(async () => {
      if (editingId) await api.patch<Person>(`/api/birthdays/people/${editingId}`, body);
      else await api.post<Person>("/api/birthdays/people", body);
      reset();
    });
  }

  return (
    <section className="card p-4" aria-label={others ? t("birthdays.others") : t("nav.birthdays")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{others ? t("birthdays.others") : t("nav.birthdays")}</h2>
      <p className="mb-3 text-xs text-muted">{others ? t("birthdays.othersIntro") : t("birthdays.settingsIntro")}</p>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

      {people.length === 0 ? (
        <p className="text-sm text-muted">{t("birthdays.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map((p) => (
            <li key={p.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${p.id === editingId ? "border-accent bg-accent-soft" : "border-edge hover:bg-base"}`}
                onClick={() => startEdit(p)}
                aria-label={t("birthdays.editNamed", { name: p.name })}
              >
                <Cake className={`h-5 w-5 shrink-0 ${p.days_until === 0 ? "text-accent" : "text-muted"}`} strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {dateText(p)}
                    {p.turns !== null ? ` · ${t("birthdays.turns", { n: p.turns })}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${p.days_until !== null && p.days_until <= 7 ? "font-semibold text-accent" : "text-muted"}`}>{when(p, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 border-t border-edge pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{editingId ? t("birthdays.editPerson") : t("birthdays.addPerson")}</h3>
        <input className="input" placeholder={t("birthdays.namePh")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label={t("birthdays.namePh")} />
        {!others && (
        <select
          className="input"
          value={form.user_id}
          onChange={(e) => {
            const member = members.find((m) => m.id === e.target.value);
            setForm({ ...form, user_id: e.target.value, name: form.name || member?.display_name || "" });
          }}
          aria-label={t("birthdays.familyMember")}
        >
          <option value="">{t("birthdays.notAMember")}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name}
            </option>
          ))}
        </select>
        )}
        <div className="grid grid-cols-3 gap-2">
          <select className="input" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} aria-label={t("birthdays.day")}>
            <option value="">{t("birthdays.day")}</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} aria-label={t("birthdays.month")}>
            <option value="">{t("birthdays.month")}</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
          <input
            className="input"
            inputMode="numeric"
            placeholder={t("birthdays.yearPh")}
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            aria-label={t("birthdays.yearPh")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={savePerson} disabled={!form.name.trim() || !form.day !== !form.month}>
            {editingId ? t("profile.save") : t("common.add")}
          </button>
          {editingId && (
            <>
              <button className="btn-ghost" onClick={reset}>
                {t("common.cancel")}
              </button>
              <button
                className="ml-auto rounded border border-red-300 px-3 py-1 text-xs text-red-700"
                onClick={() => confirm(t("common.confirmRemove", { name: form.name })) && run(async () => { await api.del(`/api/birthdays/people/${editingId}`); reset(); })}
              >
                {t("common.remove")}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
