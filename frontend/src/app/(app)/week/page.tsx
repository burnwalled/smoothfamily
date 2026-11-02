"use client";

// Söndagskollen: a relaxed weekly moment, e.g. at Sunday dinner. Look back at last week (points,
// the top helper, family goals), ahead at the coming one (calendar with who drives, meals, whose
// turn it is), give thank-you stars, pick the family activity – and mark it done.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, HeartHandshake, Pencil, Plus, Repeat, Search, Sparkles, Star, Trophy, UtensilsCrossed } from "lucide-react";
import { api, Member, MealSlot, Recipe, WeekReview } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import { getIsoWeek } from "@/lib/week";
import EventLine from "@/components/calendar/EventLine";
import WebSearch, { shortTitle, useWebSearch } from "@/components/WebSearch";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A day's dinner or lunch, written straight in (3.2.0): a recipe of the same name brings its
 *  ingredients; an empty field takes the meal away. */
function MealSlotLine({ week, date, slot, name }: { week: string; date: string; slot: MealSlot; name: string | null }) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const label = t(`food.slot.${slot}`);
  async function save() {
    const next = (text ?? "").trim();
    setText(null);
    if (next !== (name ?? "")) await api.put("/api/meals/plan/meal", { week_start: week, weekday, slot, name: next || null });
  }
  if (text !== null)
    return (
      <form
        className="flex w-full max-w-md items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <UtensilsCrossed className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
        <input
          className="input h-8 min-w-0 flex-1 py-1 text-sm"
          autoFocus
          list="week-recipes"
          value={text}
          maxLength={200}
          placeholder={t("week.mealPh", { meal: label.toLowerCase() })}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === "Escape" && setText(null)}
        />
      </form>
    );
  return name ? (
    <button className="group flex items-center gap-1.5 text-left text-xs text-muted hover:text-ink" onClick={() => setText(name)} aria-label={`${label}: ${name}`}>
      <UtensilsCrossed className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {slot !== "dinner" && <span className="font-semibold">{label}:</span>}
      {name}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" strokeWidth={2} aria-hidden />
    </button>
  ) : (
    <button className="inline-flex items-center gap-1 rounded-full border border-dashed border-edge px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-ink" onClick={() => setText("")}>
      <Plus className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Star; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      {children}
    </h2>
  );
}

export default function WeekPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [start, setStart] = useState<string | null>(null);
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [activity, setActivity] = useState("");
  const webSearch = useWebSearch();
  const [ideas, setIdeas] = useState(false);
  const [starTo, setStarTo] = useState("");
  const [starText, setStarText] = useState("");
  const [error, setError] = useState("");

  // From the cache: tasks, the calendar and the meals all count in the week (RELATED in lib/api.ts),
  // so a change in any of them refreshes it.
  const weekQuery = useApi<WeekReview>(start ? `/api/week?start=${start}` : "/api/week");
  const week = weekQuery.data ?? null;
  // The week's food is planned here too (3.2.0): the recipe book's names to choose from.
  const food = me.apps.includes("food");
  const recipes = useApi<Recipe[]>(food ? "/api/meals/recipes" : null).data ?? NONE;
  const mealSettings = useApi<{ lunchboxes: number; weekend_lunch: boolean }>(food ? "/api/meals/settings" : null).data;
  // The activity field starts from what is saved.
  useEffect(() => {
    if (week) setActivity(week.activity ?? "");
  }, [week?.week_start, week?.activity]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!week) return <p className="text-sm text-muted">{error || weekQuery.error?.message || t("common.loading")}</p>;

  const first = week.week_start;
  const weekNo = getIsoWeek(new Date(`${first}T12:00:00`));
  const range = `${new Date(`${first}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} – ${new Date(`${addDays(first, 6)}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`;
  const maxPoints = Math.max(1, ...week.points.map((p) => p.points));
  const others = members.filter((m) => m.id !== me.id);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
            <HeartHandshake className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
            {t("week.title")}
          </h1>
          <p className="text-sm text-muted">{t("week.subtitle", { week: weekNo, range })}</p>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost px-2" onClick={() => setStart(addDays(first, -7))} aria-label={t("calendar.prev")}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button className="btn-ghost px-2" onClick={() => setStart(addDays(first, 7))} aria-label={t("calendar.next")}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {week.done_at && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <CircleCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
          {t("week.doneBy", { name: week.done_by_name ?? "" })}
          {adult && (
            <button className="ml-auto text-xs underline" onClick={() => run(() => api.del(`/api/week/${first}/done`))}>
              {t("week.reopen")}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle icon={Trophy}>{t("week.lookBack", { week: getIsoWeek(new Date(`${week.last_week_start}T12:00:00`)) })}</SectionTitle>
          {week.top_helper ? (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-accent-soft p-3 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
              {t("week.topHelper", { name: week.top_helper })}
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted">{t("week.quietWeek")}</p>
          )}
          <ul className="space-y-2">
            {week.points.map((p) => (
              <li key={p.user_id} className="text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-muted">{t("week.pointsTasks", { points: p.points, tasks: p.tasks })}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-base">
                  <div className="h-full rounded-full" style={{ width: `${(p.points / maxPoints) * 100}%`, background: p.color }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{t("week.tasksDone", { n: week.tasks_done })}</p>
          {week.goals.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-edge pt-3">
              {week.goals.map((goal) => (
                <div key={goal.title} className="text-sm">
                  <div className="flex justify-between">
                    <span>{goal.title}</span>
                    <span className="text-muted">{goal.unlocked ? t("week.goalReached") : `${Math.min(goal.points, goal.required)}/${goal.required}`}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-base">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (goal.points / goal.required) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <SectionTitle icon={Star}>{t("week.stars")}</SectionTitle>
          {week.stars.length === 0 ? (
            <p className="text-sm text-muted">{t("week.noStars")}</p>
          ) : (
            <ul className="space-y-2">
              {week.stars.map((star) => (
                <li key={star.id} className="flex items-start gap-2 text-sm">
                  <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{t("week.starFromTo", { from: star.from_name, to: star.to_name })}</span>
                    {star.message && <span className="block text-muted">{star.message}</span>}
                  </span>
                  {(star.from_user === me.id || adult) && (
                    <button className="text-xs text-muted hover:underline" onClick={() => run(() => api.del(`/api/week/stars/${star.id}`))}>
                      {t("common.remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!starTo) return;
              run(async () => {
                await api.post(`/api/week/${first}/stars`, { to_user: starTo, message: starText.trim() });
                setStarText("");
                setStarTo("");
              });
            }}
          >
            <select className="input w-auto" value={starTo} onChange={(e) => setStarTo(e.target.value)} aria-label={t("week.starTo")}>
              <option value="">{t("week.starTo")}</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
            <input
              className="input min-w-40 flex-1"
              value={starText}
              maxLength={200}
              onChange={(e) => setStarText(e.target.value)}
              placeholder={t("week.starPh")}
              aria-label={t("week.starMessage")}
            />
            <button className="btn-primary" disabled={!starTo}>{t("week.giveStar")}</button>
          </form>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionTitle icon={CalendarDays}>{t("week.ahead", { week: weekNo })}</SectionTitle>
            {food && (
              <Link href={`/food?week=${first}`} className="btn-ghost border border-edge px-3 py-1 text-xs">
                <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {t("week.planFood")}
              </Link>
            )}
          </div>
          <p className="mb-2 text-xs text-muted">{t("week.aheadHint")}</p>
          <datalist id="week-recipes">
            {recipes.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </datalist>
          <ul className="divide-y divide-edge">
            {week.days.map((day) => (
              <li key={day.date} className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4">
                <span className="w-32 shrink-0 text-sm font-semibold capitalize">
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric" })}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {day.events.length === 0 && !day.meal && !food && <p className="text-xs text-muted">—</p>}
                  {day.events.length > 0 && (
                    <ul className="space-y-1.5">
                      {day.events.map((event, i) => (
                        <EventLine key={`${event.key ?? event.title}-${i}`} event={event} members={members} />
                      ))}
                    </ul>
                  )}
                  {food ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <MealSlotLine week={first} date={day.date} slot="dinner" name={day.meal} />
                      {(() => {
                        // A weekday's lunchbox or the weekend's lunch – when the family plans them, or one is set.
                        const weekend = new Date(`${day.date}T12:00:00`).getDay() % 6 === 0;
                        const planned = weekend ? mealSettings?.weekend_lunch : (mealSettings?.lunchboxes ?? 0) > 0;
                        return (day.lunch || planned) && <MealSlotLine week={first} date={day.date} slot={weekend ? "lunch" : "lunchbox"} name={day.lunch ?? null} />;
                      })()}
                    </div>
                  ) : (
                    day.meal && (
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        {day.meal}
                      </p>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
          {week.turns.length > 0 && (
            <div className="mt-3 border-t border-edge pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <Repeat className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {t("week.turns")}
              </p>
              <ul className="flex flex-wrap gap-2">
                {week.turns.map((turn) => (
                  <li key={turn.title} className="rounded-full border border-edge px-3 py-1 text-sm">
                    {turn.title}: <span className="font-semibold">{turn.name ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <SectionTitle icon={Sparkles}>{t("week.activity")}</SectionTitle>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.put(`/api/week/${first}/activity`, { activity: activity.trim() || null }));
            }}
          >
            <input
              className="input min-w-48 flex-1"
              value={activity}
              maxLength={200}
              onChange={(e) => setActivity(e.target.value)}
              placeholder={t("week.activityPh")}
              aria-label={t("week.activity")}
            />
            <button className="btn-ghost border border-edge">{t("profile.save")}</button>
            {webSearch.enabled && (
              <button type="button" className="btn-ghost border border-edge" onClick={() => setIdeas(true)} aria-expanded={ideas}>
                <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("week.findIdeas")}
              </button>
            )}
          </form>
          {ideas && (
            <WebSearch
              initial={[t("week.ideasQuery"), webSearch.place ?? ""].join(" ").trim()}
              hint={t("week.ideasHint")}
              pickLabel={t("week.useIdea")}
              onClose={() => setIdeas(false)}
              onPick={(hit) => {
                setActivity(shortTitle(hit.title).slice(0, 200));
                setIdeas(false);
              }}
            />
          )}
          {!week.done_at && (
            <button
              className="btn-primary mt-4 flex items-center gap-2"
              onClick={() =>
                run(async () => {
                  if (activity.trim() !== (week.activity ?? "")) await api.put(`/api/week/${first}/activity`, { activity: activity.trim() || null });
                  await api.post(`/api/week/${first}/done`, {});
                })
              }
            >
              <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("week.done")}
            </button>
          )}
          <p className="mt-2 text-xs text-muted">{t("week.doneHelp")}</p>
          {me.role === "admin" && (
            <label className="mt-4 flex items-center gap-2 border-t border-edge pt-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={week.reminder}
                onChange={(e) => run(() => api.put("/api/week/settings", { reminder: e.target.checked }))}
              />
              {t("week.reminder")}
            </label>
          )}
        </section>
      </div>
    </>
  );
}
