"use client";

// The family's calendar: iCal subscriptions and events created in the app. The week over the hours,
// the month with what is on each day written out, and the agenda – a card per day (2.7.0).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Car, Pencil, Plus } from "lucide-react";
import EventPlanPanel, { EventPlanBadges } from "@/components/EventPlanPanel";
import FamilyEventForm from "@/components/FamilyEventForm";
import { api, CalendarEvent, isoDate, Member } from "@/lib/api";
import { eventDayKeys, toLocalDateKey } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import { formatIsoWeekRange, getIsoWeek, startOfIsoWeek } from "@/lib/week";
import MonthGrid from "@/components/calendar/MonthGrid";
import WeekGrid from "@/components/calendar/WeekGrid";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";
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

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function EventLine({ event, members, dateLocale, busyLabel, allDayLabel, onEdit, onChanged }: {
  event: CalendarEvent;
  members: Member[];
  dateLocale: string;
  busyLabel: string;
  allDayLabel: string;
  onEdit?: (event: CalendarEvent) => void;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const tagged = members.filter((m) => event.member_ids?.includes(m.id));
  const content = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.color }} />
      <span className="font-medium">
        {event.all_day
          ? allDayLabel
          : new Date(event.start).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span>{event.busy ? busyLabel : event.title}</span>
      {!event.busy && event.location && <span className="text-xs text-muted">· {event.location}</span>}
      {/* Subscribed calendars: show which calendar the event comes from. */}
      {event.feed_id && (
        <span className="rounded border border-edge px-1.5 text-[11px] leading-5 text-muted">{event.feed_name}</span>
      )}
      {tagged.length > 0 && (
        <span className="flex -space-x-1" aria-label={tagged.map((m) => m.display_name).join(", ")}>
          {tagged.map((m) => (
            <span
              key={m.id}
              title={m.display_name}
              className="grid h-5 w-5 place-items-center rounded-full border border-surface text-[9px] font-bold text-white"
              style={{ background: m.color }}
            >
              {initials(m.display_name)}
            </span>
          ))}
        </span>
      )}
      <EventPlanBadges event={event} members={members} />
    </>
  );
  return (
    <li>
      <div className="flex items-center gap-1">
        {onEdit ? (
          <button className="group flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded text-left text-sm hover:bg-base" onClick={() => onEdit(event)}>
            {content}
            <Pencil className="ml-auto h-3.5 w-3.5 shrink-0 text-muted opacity-60 group-hover:opacity-100" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">{content}</div>
        )}
        {event.key && (
          <button
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-base ${open ? "bg-base text-accent" : "text-muted"}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("rides.open", { title: event.title ?? "" })}
            title={t("rides.open", { title: event.title ?? "" })}
          >
            <Car className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      {open && event.key && <EventPlanPanel event={event} members={members} onChanged={onChanged} />}
    </li>
  );
}

export default function CalendarPage() {
  const { t, dateLocale } = useI18n();
  const [view, setView] = useState<CalendarView>(() => {
    if (typeof window === "undefined") return "week";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "month" || stored === "agenda" ? stored : "week";
  });
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const me = useMe();
  const [members, setMembers] = useState<Member[]>([]);
  // Two homes: without a schedule, a quiet link for the adults to set one up.
  const [hasCustody, setHasCustody] = useState(false);
  useEffect(() => {
    api.get<unknown[]>("/api/custody").then((rows) => setHasCustody(rows.length > 0)).catch(() => {});
  }, []);
  // null = no form; { event: undefined } = new event; { event } = editing that event.
  const [form, setForm] = useState<{ event?: CalendarEvent } | null>(null);

  useEffect(() => {
    // Shortcut from the dashboard: /calendar?new=1 opens the form right away.
    if (new URLSearchParams(window.location.search).get("new") === "1") setForm({});
    api.live<Member[]>("/api/family/members", setMembers).catch(() => {});
  }, []);

  const load = useCallback(() => {
    let start = new Date(weekStart);
    let end = new Date(weekStart);

    if (view === "month") {
      start = startOfMonthGrid(weekStart);
      end = new Date(start);
      end.setDate(start.getDate() + 42);
    } else {
      end.setDate(weekStart.getDate() + 7);
    }

    api
      .live<CalendarEvent[]>(`/api/calendar/events?start=${isoDate(start)}&end=${isoDate(end)}`, setEvents)
      .catch(() => setEvents([]));
  }, [weekStart, view]);
  // Changes made elsewhere in the family show up at once.
  useLive(["calendar"], load);

  useEffect(load, [load]);

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
    load();
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
                    <EventLine key={`${selectedDay}-${i}`} event={event} members={members} dateLocale={dateLocale} busyLabel={t("calendar.busy")} allDayLabel={t("calendar.allDay")} onEdit={editHandler(event)} onChanged={load} />
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
                      <EventLine key={`${dayKey}-${i}`} event={event} members={members} dateLocale={dateLocale} busyLabel={t("calendar.busy")} allDayLabel={t("calendar.allDay")} onEdit={editHandler(event)} onChanged={load} />
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
