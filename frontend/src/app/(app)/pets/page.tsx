"use client";

// Pets: each animal with its care (vet, vaccinations … with the next due date – the adults are
// reminded), its chores (tasks, with members taking turns) and a link to its medicines.
import { useState } from "react";
import Link from "next/link";
import { PawPrint, Plus, Repeat, Trash2 } from "lucide-react";
import { api, Member, Pet } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";

const SPECIES = ["dog", "cat", "rabbit", "guinea_pig", "hamster", "bird", "fish", "horse", "reptile", "other"] as const;
const CARE = ["vet", "vaccination", "deworming", "grooming", "other"] as const;
const ICON: Record<string, string> = { dog: "🐕", cat: "🐈", rabbit: "🐇", guinea_pig: "🐹", hamster: "🐹", bird: "🐦", fish: "🐟", horse: "🐎", reptile: "🦎", other: "🐾" };

export default function PetsPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const isAdult = me.role !== "child";
  // From the cache: a change here, or a pet chore ticked off (tasks are RELATED), refreshes it.
  const pets = useApi<Pet[]>("/api/pets").data ?? NONE;
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [newPet, setNewPet] = useState({ name: "", species: "dog", birth: "" });
  const [care, setCare] = useState<Record<string, { kind: string; title: string; date: string; next: string }>>({});
  const [chore, setChore] = useState<Record<string, { title: string; turns: string[] }>>({});
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

  const day = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "");
  const name = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "";
  const soon = (iso: string | null) => !!iso && (new Date(`${iso}T12:00:00`).getTime() - Date.now()) / 86400000 <= 14;

  return (
    <>
      <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
        <PawPrint className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
        {t("nav.pets")}
      </h1>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {pets.length === 0 && <p className="mt-6 text-sm text-muted">{t("pets.empty")}</p>}

      {pets.map((pet) => {
        const c = care[pet.id] ?? { kind: "vet", title: "", date: "", next: "" };
        const ch = chore[pet.id] ?? { title: "", turns: [] };
        return (
          <section key={pet.id} className="card mt-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{ICON[pet.species] ?? "🐾"} {pet.name}</h2>
                <p className="text-xs text-muted">
                  {t(`pets.species.${pet.species}` as TranslationKey)}
                  {pet.birth_date ? ` · ${t("pets.born", { date: day(pet.birth_date) })}` : ""}
                </p>
              </div>
              <span className="flex items-center gap-2">
                {me.apps.includes("medicine") && <Link href="/medicine" className="btn-ghost px-2 py-1 text-xs">{t("pets.medicines")}</Link>}
                {isAdult && (
                  <button className="rounded px-2 py-1 text-red-700 hover:bg-base" onClick={() => confirm(t("common.confirmRemove", { name: pet.name })) && run(() => api.del(`/api/pets/${pet.id}`))} aria-label={t("common.remove")}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </span>
            </div>

            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{t("pets.care")}</h3>
            {pet.care.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t("pets.noCare")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {pet.care.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <span className="flex-1">
                      {item.title}
                      <span className="text-muted"> · {t(`pets.care.${item.kind}` as TranslationKey)}{item.date ? ` · ${day(item.date)}` : ""}</span>
                    </span>
                    {item.next_due && (
                      <span className={`text-xs ${soon(item.next_due) ? "font-semibold text-accent" : "text-muted"}`}>{t("pets.nextDue", { date: day(item.next_due) })}</span>
                    )}
                    {isAdult && (
                      <button className="text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/pets/${pet.id}/care/${item.id}`))} aria-label={t("common.remove")}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isAdult && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto_auto]">
                <select className="input" value={c.kind} onChange={(e) => setCare({ ...care, [pet.id]: { ...c, kind: e.target.value } })} aria-label={t("pets.careKind")}>
                  {CARE.map((k) => <option key={k} value={k}>{t(`pets.care.${k}` as TranslationKey)}</option>)}
                </select>
                <input className="input" placeholder={t("pets.carePh")} value={c.title} onChange={(e) => setCare({ ...care, [pet.id]: { ...c, title: e.target.value } })} aria-label={t("pets.carePh")} />
                <input className="input" type="date" value={c.date} onChange={(e) => setCare({ ...care, [pet.id]: { ...c, date: e.target.value } })} aria-label={t("pets.careDate")} title={t("pets.careDate")} />
                <input className="input" type="date" value={c.next} onChange={(e) => setCare({ ...care, [pet.id]: { ...c, next: e.target.value } })} aria-label={t("pets.careNext")} title={t("pets.careNext")} />
                <button
                  className="btn-ghost border border-edge"
                  disabled={!c.title.trim()}
                  onClick={() =>
                    run(() => api.post(`/api/pets/${pet.id}/care`, { kind: c.kind, title: c.title.trim(), date: c.date || null, next_due: c.next || null })).then(
                      (ok) => ok && setCare({ ...care, [pet.id]: { kind: "vet", title: "", date: "", next: "" } })
                    )
                  }
                >
                  {t("common.add")}
                </button>
              </div>
            )}

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("pets.chores")}</h3>
            {pet.chores.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t("pets.noChores")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {pet.chores.map((task) => (
                  <li key={task.id} className="flex items-center gap-2">
                    {task.rotation_user_ids.length >= 2 && <Repeat className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-label={t("tasks.takeTurns")} />}
                    <span className="flex-1">{task.title}</span>
                    <span className="text-xs text-muted">{task.assignee_id ? t("pets.turn", { name: name(task.assignee_id) }) : t("tasks.anyone")}</span>
                  </li>
                ))}
              </ul>
            )}
            {isAdult && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input className="input min-w-48 flex-1" placeholder={t("pets.chorePh", { name: pet.name })} value={ch.title} onChange={(e) => setChore({ ...chore, [pet.id]: { ...ch, title: e.target.value } })} aria-label={t("pets.chorePh", { name: pet.name })} />
                  <button
                    className="btn-ghost border border-edge"
                    disabled={!ch.title.trim() || ch.turns.length === 1}
                    onClick={() =>
                      run(() =>
                        api.post("/api/tasks?force=true", {
                          title: ch.title.trim(),
                          recurrence: "daily",
                          points: 5,
                          pet_id: pet.id,
                          rotation_user_ids: ch.turns,
                          assignee_id: ch.turns[0] ?? null,
                        })
                      ).then((ok) => ok && setChore({ ...chore, [pet.id]: { title: "", turns: [] } }))
                    }
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {t("pets.addChore")}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">{t("pets.choreTurns")}</span>
                  {members.map((m) => {
                    const at = ch.turns.indexOf(m.id);
                    return (
                      <button
                        key={m.id}
                        className={`rounded-full border px-2.5 py-0.5 ${at >= 0 ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}
                        onClick={() => setChore({ ...chore, [pet.id]: { ...ch, turns: at >= 0 ? ch.turns.filter((x) => x !== m.id) : [...ch.turns, m.id] } })}
                        aria-pressed={at >= 0}
                      >
                        {at >= 0 ? `${at + 1}. ` : ""}{m.display_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {isAdult && (
        <section className="card mt-6 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("pets.add")}</h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input className="input" placeholder={t("pets.namePh")} value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} aria-label={t("pets.namePh")} />
            <select className="input" value={newPet.species} onChange={(e) => setNewPet({ ...newPet, species: e.target.value })} aria-label={t("pets.species")}>
              {SPECIES.map((s) => <option key={s} value={s}>{t(`pets.species.${s}` as TranslationKey)}</option>)}
            </select>
            <input className="input" type="date" value={newPet.birth} onChange={(e) => setNewPet({ ...newPet, birth: e.target.value })} aria-label={t("pets.birthDate")} title={t("pets.birthDate")} />
            <button
              className="btn-primary"
              disabled={!newPet.name.trim()}
              onClick={() =>
                run(() => api.post("/api/pets", { name: newPet.name.trim(), species: newPet.species, birth_date: newPet.birth || null })).then(
                  (ok) => ok && setNewPet({ name: "", species: "dog", birth: "" })
                )
              }
            >
              {t("common.add")}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
