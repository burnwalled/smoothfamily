"use client";

// The week (2.7.0): the days side by side over the hours, all-day events in a row of their own at
// the top, events that clash next to each other, and a line at the time it is now. A tap on an event
// shows it under the grid (3.5.1).
import { useEffect, useRef, useState } from "react";
import { CalendarEvent } from "@/lib/api";
import { toLocalDateKey, eventDayKeys } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import { getIsoWeek } from "@/lib/week";
import { hourRange, isLong, placeTimed, weekBars } from "@/lib/calendarLayout";
import { EventBar, barLabel } from "@/components/calendar/MonthGrid";

const HOUR_PX = 44;
const ALL_DAY_LANES = 3;

export default function WeekGrid({
  days,
  events,
  todayKey,
  selectedDay,
  onSelectDay,
  onSelectEvent,
}: {
  days: Date[];
  events: CalendarEvent[];
  todayKey: string;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
  onSelectEvent: (event: CalendarEvent, dayKey: string) => void;
}) {
  const { t, dateLocale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const keys = days.map(toLocalDateKey);
  // On a phone the week scrolls sideways: start with today in view.
  const scroller = useRef<HTMLDivElement>(null);
  const todayIndex = keys.indexOf(todayKey);
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth || todayIndex < 0) return;
    const column = (el.scrollWidth - 48) / 7;
    el.scrollLeft = Math.max(0, 48 + column * todayIndex - (el.clientWidth - column) / 2);
  }, [todayIndex, keys[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const { bars, more } = weekBars(events, keys, ALL_DAY_LANES, isLong);
  const lanes = Math.max(1, Math.min(ALL_DAY_LANES, Math.max(0, ...bars.map((b) => b.lane + 1))));
  const timed = events.filter((e) => !isLong(e));
  const [from, to] = hourRange(timed);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const nowTop = ((now.getHours() - from) * 60 + now.getMinutes()) * (HOUR_PX / 60);

  return (
    <div ref={scroller} className="card overflow-x-auto">
      <div className="min-w-[640px]">
        {/* The days */}
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-edge bg-base/50">
          <div className="sticky left-0 z-10 grid place-items-center bg-base text-[11px] font-bold text-muted">{t("calendar.weekShort", { n: getIsoWeek(days[0]) })}</div>
          {days.map((day, i) => {
            const isToday = keys[i] === todayKey;
            return (
              <button key={keys[i]} className={`border-l border-edge px-2 py-1.5 text-left ${selectedDay === keys[i] ? "bg-accent-soft/50" : "hover:bg-base"}`} onClick={() => onSelectDay(keys[i])}>
                <span className="block text-[11px] uppercase tracking-wide text-muted">{day.toLocaleDateString(dateLocale, { weekday: "short" })}</span>
                <span className={`inline-grid h-7 min-w-7 place-items-center rounded-full px-1 text-sm font-bold ${isToday ? "bg-accent text-white" : ""}`}>{day.getDate()}</span>
              </button>
            );
          })}
        </div>
        {/* All day, and over several days */}
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-edge py-1" style={{ gridTemplateRows: `repeat(${lanes}, 1.375rem)${more.some(Boolean) ? " 1.25rem" : ""}` }}>
          <div className="sticky left-0 z-10 flex items-center justify-center bg-surface text-[10px] text-muted" style={{ gridRow: "1 / -1", gridColumn: 1 }}>{t("calendar.allDay")}</div>
          {bars.map((bar) => (
            <EventBar key={`${bar.event.event_id ?? bar.event.feed_id}-${bar.event.start}`} bar={bar} firstRow={1} dateLocale={dateLocale} busy={t("calendar.busy")} onClick={() => onSelectEvent(bar.event, keys[bar.col])} />
          ))}
          {more.map((n, i) => (n > 0 ? <span key={i} className="px-1.5 text-[11px] font-semibold text-muted" style={{ gridColumn: i + 2, gridRow: lanes + 1 }}>{t("calendar.more", { n })}</span> : null))}
        </div>
        {/* The hours */}
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
          {/* Stays put while the days scroll sideways on a phone. */}
          <div className="sticky left-0 z-10 bg-surface" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted" style={{ top: i * HOUR_PX }}>
                {i > 0 ? `${String(h).padStart(2, "0")}` : ""}
              </span>
            ))}
          </div>
          {days.map((day, i) => {
            const dayEvents = timed.filter((e) => eventDayKeys(e).includes(keys[i]));
            const placed = placeTimed(dayEvents, day, from, to);
            const isToday = keys[i] === todayKey;
            return (
              <div
                key={keys[i]}
                className={`relative border-l border-edge ${isToday ? "bg-accent-soft/20" : ""}`}
                style={{ height: hours.length * HOUR_PX, backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--c-edge)) 0, rgb(var(--c-edge)) 1px, transparent 1px, transparent ${HOUR_PX}px)` }}
                onClick={() => onSelectDay(keys[i])}
              >
                {placed.map((p) => {
                  const start = new Date(p.event.start);
                  const end = new Date(p.event.end);
                  const time = `${start.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}`;
                  return (
                    <button
                      key={`${p.event.event_id ?? p.event.feed_id}-${p.event.start}`}
                      className="absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm hover:z-[9] hover:shadow-md"
                      style={{
                        top: (p.top * HOUR_PX) / 60,
                        height: Math.max(20, (p.height * HOUR_PX) / 60 - 2),
                        left: `calc(${(p.column / p.columns) * 100}% + 2px)`,
                        width: `calc(${100 / p.columns}% - 4px)`,
                        borderLeftColor: p.event.color,
                        background: `color-mix(in srgb, ${p.event.color} 18%, rgb(var(--c-surface)))`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(p.event, keys[i]);
                      }}
                      title={`${time} ${barLabel(p.event, dateLocale, t("calendar.busy"))}`}
                    >
                      <span className="block font-semibold">{p.event.busy ? t("calendar.busy") : p.event.title}</span>
                      {p.height >= 40 && <span className="block text-[10px] text-muted">{time}</span>}
                    </button>
                  );
                })}
                {isToday && nowTop >= 0 && nowTop <= hours.length * HOUR_PX && (
                  <div className="pointer-events-none absolute inset-x-0 z-[8] h-0.5 bg-red-500" style={{ top: nowTop }} aria-hidden>
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
