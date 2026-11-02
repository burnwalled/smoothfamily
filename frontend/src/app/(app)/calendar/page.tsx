"use client";

// The family's calendar: iCal subscriptions and events created in the app. The week over the hours,
// the month with what is on each day written out, and the agenda – a card per day (2.7.0).
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { Plus } from "lucide-react";
import EventLine from "@/components/calendar/EventLine";
import FamilyEventForm from "@/components/FamilyEventForm";
import { CalendarEvent, isoDate, Member } from "@/lib/api";
import { eventDayKeys, toLocalDateKey } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { keepPreviousData } from "@tanstack/react-query";
import { formatIsoWeekRange, getIsoWeek, startOfIsoWeek } from "@/lib/week";
import MonthGrid from "@/components/calendar/MonthGrid";
import WeekGrid from "@/components/calendar/WeekGrid";
import { useMe } from "@/components/Shell";
import PageTitle from "@/components/PageTitle";

type CalendarView = "week" | "month" | "agenda";

const VIEW_STORAGE_KEY = "sf.calendar.view";

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfIsoWeek(first);
}

function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    for (const key of eventDayKeys(e)) {
      acc[key] = acc[key] || [];
      acc[key].push(e);
    }
    return acc;
  }, {});
}

export default function CalendarPage() {
  const { t, dateLocale } = useI18n();
  const [view, setView] = useState<CalendarView>(() => {
    if (typeof window === "undefined") return "week";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "month" || stored === "agenda" ? stored : "week";
  });
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const me = useMe();
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  // Two homes: without a schedule, a quiet link for the adults to set one up.
  const hasCustody = (useApi<unknown[]>("/api/custody").data?.length ?? 0) > 0;
  // null = no form; { event: undefined } = new event; { event } = editing that event.
  const [form, setForm] = useState<{ event?: CalendarEvent } | null>(null);

  useEffect(() => {
    // Shortcut from the dashboard: /calendar?new=1 opens the form right away.
    if (new URLSearchParams(window.location.search).get("new") === "1") setForm({});
  }, []);

  // The period on screen, from the cache: a saved event (here or elsewhere in the family) refreshes
  // it. Moving to the next week keeps the last one on screen until it has come.
  const range = useMemo(() => {
    let start = new Date(weekStart);
    let end = new Date(weekStart);
    if (view === "month") {
      start = startOfMonthGrid(weekStart);
      end = new Date(start);
      end.setDate(start.getDate() + 42);
    } else {
      end.setDate(weekStart.getDate() + 7);
    }
    return `start=${isoDate(start)}&end=${isoDate(end)}`;
  }, [weekStart, view]);
  const events = useApi<CalendarEvent[]>(`/api/calendar/events?${range}`, { placeholderData: keepPreviousData }).data ?? NONE;

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  function shiftWeek(delta: number) {
    const next = new Date(weekStart);
    if (view === "month") {
      next.setMonth(weekStart.getMonth() + delta);
      next.setDate(1);
    } else {
      next.setDate(weekStart.getDate() + delta * 7);
    }
    setWeekStart(next);
    setSelectedDay(null);
  }

  // Back to a week view from the month: the week of the first of the month (or of today).
  function changeView(next: CalendarView) {
    if (view === "month" && next !== "month") {
      const today = new Date();
      setWeekStart(startOfIsoWeek(today.getMonth() === weekStart.getMonth() && today.getFullYear() === weekStart.getFullYear() ? today : weekStart));
    }
    setView(next);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const monthStart = startOfMonthGrid(weekStart);
  // Five or six week rows, as the month needs.
  const monthLast = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
  const monthRows = Math.ceil(((monthLast.getTime() - monthStart.getTime()) / 86_400_000 + 1) / 7);
  const monthDays = Array.from({ length: monthRows * 7 }, (_, i) => {
    const d = new Date(monthStart);
    d.setDate(monthStart.getDate() + i);
    return d;
  });
  const period =
    view === "month"
      ? weekStart.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })
      : `${formatIsoWeekRange(weekStart, dateLocale)} ${weekStart.getFullYear()} · ${t("calendar.weekShort", { n: getIsoWeek(weekStart) })}`;
  const grouped = groupByDay(events);
  const todayKey = toLocalDateKey(new Date());
  const selectedDayEvents = selectedDay ? (grouped[selectedDay] || []) : [];

  // New events default to the selected day, else today when it is in view, else the first day shown.
  const shownDayKeys = (view === "month" ? monthDays : weekDays).map(toLocalDateKey);
  const newEventDate = shownDayKeys.includes(todayKey) ? todayKey : toLocalDateKey(view === "month" ? new Date(weekStart.getFullYear(), weekStart.getMonth(), 1) : weekStart);

  // App events can be changed by their creator and by adults; feed events are read-only.
  function editHandler(event: CalendarEvent): ((event: CalendarEvent) => void) | undefined {
    if (!event.event_id || !me) return undefined;
    if (event.created_by !== me.id && me.role !== "admin" && me.role !== "adult") return undefined;
    return (ev) => {
      setForm({ event: ev });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  function eventSaved() {
    setForm(null);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <PageTitle title={t("calendar.title")} />
        {/* Two homes is a tab of its own once a schedule is set up (3.0.1). */}
        <button className="btn-primary shrink-0" onClick={() => setForm(form ? null : {})}>
          {form ? t("common.cancel") : t("calendar.newEvent")}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-bold capitalize" aria-live="polite">{period}</p>
        <div className="flex flex-wrap items-center gap-1">
          <div className="mr-1 rounded-lg border border-edge bg-surface p-1">
            {(["week", "month", "agenda"] as const).map((v) => (
              <button key={v} className={`rounded px-3 py-1 text-xs ${view === v ? "bg-base font-semibold" : "text-muted"}`} aria-pressed={view === v} onClick={() => changeView(v)}>
                {t(v === "week" ? "calendar.viewWeek" : v === "month" ? "calendar.viewMonth" : "calendar.viewAgenda")}
              </button>
            ))}
          </div>
          <button className="btn-ghost px-2" onClick={() => shiftWeek(-1)} aria-label={t("calendar.prev")}><span aria-hidden className="sm:hidden">←</span><span className="hidden sm:inline">{t("calendar.prev")}</span></button>
          <button className="btn-ghost px-2" onClick={() => { setWeekStart(view === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1) : startOfIsoWeek(new Date())); setSelectedDay(null); }}>{t("calendar.today")}</button>
          <button className="btn-ghost px-2" onClick={() => shiftWeek(1)} aria-label={t("calendar.next")}><span aria-hidden className="sm:hidden">→</span><span className="hidden sm:inline">{t("calendar.next")}</span></button>
        </div>
      </div>
      {form && (
        <FamilyEventForm
          key={form.event?.event_id ?? "new"}
          event={form.event}
          members={members}
          defaultDate={selectedDay ?? newEventDate}
          onDone={eventSaved}
          onCancel={() => setForm(null)}
        />
      )}
      {view === "week" && (
        <div className="mt-4">
          <WeekGrid days={weekDays} events={events} todayKey={todayKey} selectedDay={selectedDay} onSelectDay={(key) => setSelectedDay(key === selectedDay ? null : key)} />
        </div>
      )}

      {view === "month" && (
        <div className="mt-4">
          <MonthGrid days={monthDays} month={weekStart.getMonth()} events={events} todayKey={todayKey} selectedDay={selectedDay} onSelectDay={(key) => setSelectedDay(key === selectedDay ? null : key)} />
        </div>
      )}

      {view !== "agenda" && (
        <div>
          {selectedDay && (
            <section className="card mt-4 p-4">
              <h2 className="mb-2 text-sm font-bold capitalize">
                {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
              </h2>
              {selectedDayEvents.length === 0 ? (
                <p className="text-xs text-muted">—</p>
              ) : (
                <ul className="space-y-1">
                  {selectedDayEvents.map((event, i) => (
                    <EventLine key={`${selectedDay}-${i}`} event={event} members={members} onEdit={editHandler(event)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {view === "agenda" && (
        <div className="mt-6 space-y-3">
          {weekDays.map((day) => {
            const dayKey = toLocalDateKey(day);
            const dayEvents = grouped[dayKey] || [];
            const isToday = dayKey === todayKey;
            return (
              <section key={dayKey} className={`card p-4 ${isToday ? "ring-2 ring-accent" : ""}`}>
                <h2 className="mb-2 text-sm font-bold capitalize">
                  {day.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
                  {isToday && <span className="ml-2 rounded bg-accent-soft px-2 py-0.5 text-xs">{t("calendar.today")}</span>}
                </h2>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted">—</p>
                ) : (
                  <ul className="space-y-1">
                    {dayEvents.map((event, i) => (
                      <EventLine key={`${dayKey}-${i}`} event={event} members={members} onEdit={editHandler(event)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">{t("calendar.footnote")}</p>
      {!hasCustody && me.role !== "child" && (
        <p className="mt-1 text-xs text-muted">
          <Link href="/calendar/custody" className="underline">{t("custody.setUpLink")}</Link>
        </p>
      )}
      {!form && (
        <button
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-10 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg md:hidden"
          onClick={() => {
            setForm({});
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label={t("calendar.newEvent")}
        >
          <Plus className="h-7 w-7" strokeWidth={2.25} />
        </button>
      )}
    </>
  );
}
