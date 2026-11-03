"use client";

// Health (3.4.0): each person's workouts and the day's numbers – steps, sleep, weight – private until
// they share them with the adults or the family. The adults see and enter a child's; a child's weight
// isn't kept, and weight is never in the family's overview.
import { useState } from "react";
import {
  Activity, Bike, Download, Dumbbell, Flame, Flower2, Footprints, LucideIcon, Moon, MountainSnow, PersonStanding, Scale, Trash2, Volleyball, Waves,
} from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";

type Category = "workouts" | "steps" | "sleep" | "weight";
type Share = "me" | "adults" | "family";
type Person = {
  user_id: string;
  name: string;
  color: string | null;
  me: boolean;
  can_enter: boolean;
  sees: Category[];
  week_minutes: number | null;
  week_workouts: number | null;
  week_steps_avg: number | null;
  week_sleep_avg: number | null;
  streak: number | null;
};
type Workout = { id: string; day: string; kind: string; minutes: number; distance_km: number | null; note: string; source: string };
type Day = { day: string; steps: number | null; sleep_minutes: number | null; weight_kg: number | null; resting_hr: number | null };
type Detail = Person & { workouts: Workout[]; days: Day[]; share: Record<Category, Share> | null };

const KINDS: [string, LucideIcon][] = [
  ["walk", Footprints], ["run", PersonStanding], ["bike", Bike], ["swim", Waves], ["gym", Dumbbell],
  ["ski", MountainSnow], ["sport", Volleyball], ["yoga", Flower2], ["play", Activity], ["other", Flame],
];
const KIND_ICON = Object.fromEntries(KINDS) as Record<string, LucideIcon>;
// The kinds where a distance makes sense.
const DISTANCE = new Set(["walk", "run", "bike", "swim", "ski"]);
const MINUTES = [15, 30, 45, 60, 90];
const DAYS_SHOWN = 28;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function HealthPage() {
  const { t } = useI18n();
  const me = useMe();
  const people = useApi<Person[]>("/api/health/people").data;
  const [chosen, setChosen] = useState<string | null>(null);
  const who = chosen ?? me.id;

  return (
    <div className="space-y-5">
      <PageTitle title={t("nav.health")} />
      <p className="text-sm text-muted">{t("health.intro")}</p>

      {/* The week for everyone the viewer may see */}
      {people && people.length > 1 && (
        <section aria-label={t("health.thisWeek")}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t("health.thisWeek")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {people.map((p) => (
              <button
                key={p.user_id}
                type="button"
                aria-pressed={who === p.user_id}
                onClick={() => setChosen(p.user_id)}
                className={`card p-3 text-left transition ${who === p.user_id ? "ring-2 ring-accent" : "hover:bg-surface"}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color ?? "#999" }} aria-hidden />
                  {p.me ? t("health.you") : p.name}
                </span>
                <WeekNumbers person={p} />
              </button>
            ))}
          </div>
        </section>
      )}

      <PersonView key={who} userId={who} />
    </div>
  );
}

function WeekNumbers({ person: p }: { person: Person }) {
  const { t } = useI18n();
  const lines = [
    p.week_minutes != null && t(p.week_workouts === 1 ? "health.weekMinutesOne" : "health.weekMinutes", { n: p.week_minutes, workouts: p.week_workouts ?? 0 }),
    p.week_steps_avg != null && t("health.stepsAvg", { n: p.week_steps_avg.toLocaleString() }),
    p.week_sleep_avg != null && t("health.sleepAvg", { time: hours(p.week_sleep_avg) }),
    !!p.streak && p.streak > 1 && t("health.streak", { n: p.streak }),
  ].filter(Boolean) as string[];
  if (!lines.length) return <span className="mt-1 block text-xs text-muted">{t("health.nothingShared")}</span>;
  return (
    <span className="mt-1 block space-y-0.5 text-xs text-muted">
      {lines.map((line) => <span key={line} className="block">{line}</span>)}
    </span>
  );
}

function hours(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function PersonView({ userId }: { userId: string }) {
  const { t, dateLocale } = useI18n();
  const path = `/api/health/people/${userId}?days=${DAYS_SHOWN}`;
  const person = useApi<Detail>(path).data;
  if (!person) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });
  const sees = new Set(person.sees);

  return (
    <div className="space-y-4">
      {!person.me && <h2 className="text-lg font-bold">{person.name}</h2>}
      <div className="grid gap-4 lg:grid-cols-2">
        {person.can_enter && sees.has("workouts") && <WorkoutForm userId={userId} />}
        {person.can_enter && <DayForm person={person} />}
      </div>

      {sees.has("workouts") && (
        <section className="card p-5" aria-label={t("health.workouts")}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("health.workouts")}</h3>
          <Bars workouts={person.workouts} />
          {person.workouts.length === 0 ? (
            <EmptyState>{t("health.noWorkouts")}</EmptyState>
          ) : (
            <ul className="mt-3 divide-y divide-edge">
              {person.workouts.map((w) => {
                const Icon = KIND_ICON[w.kind] ?? Activity;
                return (
                  <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                    <Icon className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{t(`health.kind.${w.kind}` as TranslationKey)}</span>
                      <span className="text-muted"> · {t("health.minutesShort", { n: w.minutes })}{w.distance_km ? ` · ${w.distance_km.toLocaleString(dateLocale)} km` : ""}</span>
                      {w.note && <span className="block truncate text-xs text-muted">{w.note}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{day(w.day)}</span>
                    {person.can_enter && (
                      <button className="text-muted hover:text-red-700" aria-label={t("health.deleteWorkout")} onClick={() => api.del(`/api/health/workouts/${w.id}`)}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {(sees.has("steps") || sees.has("sleep") || sees.has("weight")) && (
        <section className="card p-5" aria-label={t("health.days")}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("health.days")}</h3>
          {person.days.length === 0 ? (
            <EmptyState>{t("health.noDays")}</EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-semibold">{t("health.day")}</th>
                  {sees.has("steps") && <th className="py-1 text-right font-semibold">{t("health.steps")}</th>}
                  {sees.has("sleep") && <th className="py-1 text-right font-semibold">{t("health.sleep")}</th>}
                  {sees.has("weight") && <th className="py-1 text-right font-semibold">{t("health.weight")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {person.days.map((d) => (
                  <tr key={d.day}>
                    <td className="py-1.5">{day(d.day)}</td>
                    {sees.has("steps") && <td className="py-1.5 text-right tabular-nums">{d.steps?.toLocaleString(dateLocale) ?? "–"}</td>}
                    {sees.has("sleep") && <td className="py-1.5 text-right tabular-nums">{d.sleep_minutes != null ? hours(d.sleep_minutes) : "–"}</td>}
                    {sees.has("weight") && <td className="py-1.5 text-right tabular-nums">{d.weight_kg != null ? `${d.weight_kg.toLocaleString(dateLocale)} kg` : "–"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {person.me && person.share && <Sharing share={person.share} child={!sees.has("weight")} />}
    </div>
  );
}

// Minutes per day for the last four weeks: a bar for each day, today last.
function Bars({ workouts }: { workouts: Workout[] }) {
  const { t, dateLocale } = useI18n();
  const today = new Date();
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (DAYS_SHOWN - 1 - i));
    return iso(d);
  });
  const per = new Map<string, number>();
  for (const w of workouts) per.set(w.day, (per.get(w.day) ?? 0) + w.minutes);
  const max = Math.max(30, ...per.values());
  return (
    <div className="flex h-20 items-end gap-0.5" role="img" aria-label={t("health.chart")}>
      {days.map((d) => {
        const m = per.get(d) ?? 0;
        const label = `${new Date(`${d}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}: ${t("health.minutesShort", { n: m })}`;
        return <span key={d} title={label} className={`flex-1 rounded-t ${m ? "bg-accent" : "bg-edge"}`} style={{ height: `${Math.max(4, (m / max) * 100)}%` }} />;
      })}
    </div>
  );
}

function WorkoutForm({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [kind, setKind] = useState("walk");
  const [minutes, setMinutes] = useState(30);
  const [distance, setDistance] = useState("");
  const [day, setDay] = useState(iso(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const km = DISTANCE.has(kind) && distance ? Number(distance.replace(",", ".")) : null;
      await api.post(`/api/health/people/${userId}/workouts`, { day, kind, minutes, distance_km: km, note });
      setDistance("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-3 p-5" aria-label={t("health.logWorkout")}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("health.logWorkout")}</h3>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={t("health.kindLabel")}>
        {KINDS.map(([k, Icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 text-[11px] font-semibold ${kind === k ? "border-accent bg-accent-soft" : "border-transparent bg-surface hover:border-edge"}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
            {t(`health.kind.${k}` as TranslationKey)}
          </button>
        ))}
      </div>
      <div>
        <span className="label">{t("health.minutes")}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {MINUTES.map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={`rounded-full border px-3 py-1 text-sm ${minutes === m ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}>
              {m}
            </button>
          ))}
          <input className="input !w-24 py-1" type="number" min={1} max={1440} value={minutes} aria-label={t("health.minutes")} onChange={(e) => setMinutes(Number(e.target.value))} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">{t("health.day")}</span>
          <input className="input" type="date" value={day} max={iso(new Date())} onChange={(e) => setDay(e.target.value)} />
        </label>
        {DISTANCE.has(kind) && (
          <label>
            <span className="label">{t("health.distance")}</span>
            <input className="input" inputMode="decimal" value={distance} placeholder="km" onChange={(e) => setDistance(e.target.value)} />
          </label>
        )}
      </div>
      <input className="input" value={note} maxLength={300} placeholder={t("health.notePh")} aria-label={t("health.note")} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={saving || minutes < 1} onClick={save}>{t("health.save")}</button>
    </section>
  );
}

function DayForm({ person }: { person: Detail }) {
  const { t } = useI18n();
  const [day, setDay] = useState(iso(new Date()));
  const known = person.days.find((d) => d.day === day);
  const [steps, setSteps] = useState("");
  const [sleepH, setSleepH] = useState("");
  const [sleepM, setSleepM] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const weighs = person.sees.includes("weight");

  async function save() {
    setError("");
    setSaved(false);
    const body: Record<string, number> = {};
    if (steps) body.steps = Number(steps);
    if (sleepH || sleepM) body.sleep_minutes = Number(sleepH || 0) * 60 + Number(sleepM || 0);
    if (weighs && weight) body.weight_kg = Number(weight.replace(",", "."));
    if (!Object.keys(body).length) return;
    try {
      await api.put(`/api/health/people/${person.user_id}/days/${day}`, body);
      setSteps("");
      setSleepH("");
      setSleepM("");
      setWeight("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card space-y-3 p-5" aria-label={t("health.logDay")}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("health.logDay")}</h3>
      <label className="block">
        <span className="label">{t("health.day")}</span>
        <input className="input" type="date" value={day} max={iso(new Date())} onChange={(e) => setDay(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label flex items-center gap-1"><Footprints className="h-3.5 w-3.5" aria-hidden />{t("health.steps")}</span>
          <input className="input" type="number" min={0} value={steps} placeholder={known?.steps?.toString() ?? ""} onChange={(e) => setSteps(e.target.value)} />
        </label>
        <div>
          <span className="label flex items-center gap-1"><Moon className="h-3.5 w-3.5" aria-hidden />{t("health.sleep")}</span>
          <div className="flex items-center gap-1.5">
            <input className="input" type="number" min={0} max={24} value={sleepH} aria-label={t("health.sleepHours")} placeholder={known?.sleep_minutes != null ? String(Math.floor(known.sleep_minutes / 60)) : t("health.h")} onChange={(e) => setSleepH(e.target.value)} />
            <input className="input" type="number" min={0} max={59} value={sleepM} aria-label={t("health.sleepMinutes")} placeholder={known?.sleep_minutes != null ? String(known.sleep_minutes % 60) : t("health.min")} onChange={(e) => setSleepM(e.target.value)} />
          </div>
        </div>
        {weighs && (
          <label>
            <span className="label flex items-center gap-1"><Scale className="h-3.5 w-3.5" aria-hidden />{t("health.weight")}</span>
            <input className="input" inputMode="decimal" value={weight} placeholder={known?.weight_kg != null ? String(known.weight_kg) : "kg"} onChange={(e) => setWeight(e.target.value)} />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-accent">{t("health.saved")}</p>}
      <button className="btn-primary" onClick={save}>{t("health.save")}</button>
    </section>
  );
}

function Sharing({ share, child }: { share: Record<Category, Share>; child: boolean }) {
  const { t } = useI18n();
  const cats: Category[] = child ? ["workouts", "steps", "sleep"] : ["workouts", "steps", "sleep", "weight"];

  async function download() {
    const data = await api.get<unknown>("/api/health/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "health.json" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card space-y-3 p-5" aria-label={t("health.sharing")}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("health.sharing")}</h3>
      <p className="text-xs text-muted">{t(child ? "health.sharingHelpChild" : "health.sharingHelp")}</p>
      <div className="space-y-2">
        {cats.map((c) => (
          <label key={c} className="flex items-center justify-between gap-3 text-sm">
            <span>{t(`health.cat.${c}` as TranslationKey)}</span>
            <select className="input !w-auto py-1 text-sm" value={share[c]} onChange={(e) => api.put("/api/health/sharing", { [c]: e.target.value })}>
              <option value="me">{t("health.share.me")}</option>
              <option value="adults">{t("health.share.adults")}</option>
              <option value="family">{t("health.share.family")}</option>
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-edge pt-3 text-sm">
        <button className="btn-ghost flex items-center gap-1.5 px-2" onClick={download}>
          <Download className="h-4 w-4" aria-hidden />
          {t("health.export")}
        </button>
        <button className="text-red-700 hover:underline" onClick={() => window.confirm(t("health.deleteAllConfirm")) && api.del("/api/health/mine")}>
          {t("health.deleteAll")}
        </button>
      </div>
    </section>
  );
}
