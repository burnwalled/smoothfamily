"use client";

// The month (2.7.0): what is on each day, written out – the week number at the side, events over
// several days as one bar across them, timed ones with their time, and "+2" when a day is full.
import { CalendarEvent } from "@/lib/api";
import { toLocalDateKey } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import { getIsoWeek } from "@/lib/week";
import { Bar, isLong, weekBars } from "@/lib/calendarLayout";

const LANES = 4;

export function barLabel(event: CalendarEvent, dateLocale: string, busy: string): string {
  const title = event.busy ? busy : event.title ?? "";
  if (event.all_day || isLong(event)) return title;
  return `${barTime(event, dateLocale)} ${title}`;
}

const barTime = (event: CalendarEvent, dateLocale: string) => new Date(event.start).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });

export function EventBar({ bar, dateLocale, busy, onClick, firstRow = 2 }: { bar: Bar; dateLocale: string; busy: string; onClick: () => void; firstRow?: number }) {
  const long = isLong(bar.event);
  const label = barLabel(bar.event, dateLocale, busy);
  return (
    <button
      className={`relative z-10 mx-0.5 flex min-w-0 items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] leading-5 ${
        long ? `font-semibold text-white ${bar.fromBefore ? "rounded-l-none" : "rounded-l-md"} ${bar.goesOn ? "rounded-r-none" : "rounded-r-md"}` : "rounded-md hover:bg-base"
      }`}
      style={{ gridColumn: `${bar.col + 2} / span ${bar.span}`, gridRow: bar.lane + firstRow, ...(long ? { background: bar.event.color } : {}) }}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {!long && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bar.event.color }} aria-hidden />}
      {long ? (
        <span className="truncate">{label}</span>
      ) : (
        // On a phone's narrow day the title matters more than the time.
        <span className="truncate">
          <span className="hidden sm:inline">{barTime(bar.event, dateLocale)} </span>
          {bar.event.busy ? busy : bar.event.title}
        </span>
      )}
    </button>
  );
}

export default function MonthGrid({
  days,
  month,
  events,
  todayKey,
  selectedDay,
  onSelectDay,
}: {
  days: Date[];
  month: number;
  events: CalendarEvent[];
  todayKey: string;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
}) {
  const { t, dateLocale } = useI18n();
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] border-b border-edge bg-base/50 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <div />
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} className="px-1.5 py-1.5">{d.toLocaleDateString(dateLocale, { weekday: "short" })}</div>
        ))}
      </div>
      {weeks.map((week) => {
        const keys = week.map(toLocalDateKey);
        const { bars, more } = weekBars(events, keys, LANES);
        return (
          <div
            key={keys[0]}
            className="grid grid-cols-[2rem_repeat(7,minmax(0,1fr))] border-b border-edge last:border-b-0"
            style={{ gridTemplateRows: `2rem repeat(${LANES}, 1.375rem) 1.25rem` }}
          >
            <div className="row-span-full flex justify-center pt-1.5 text-[10px] font-semibold text-muted" style={{ gridRow: "1 / -1" }}>
              {t("calendar.weekShort", { n: getIsoWeek(week[0]) })}
            </div>
            {week.map((day, i) => {
              const key = keys[i];
              const inMonth = day.getMonth() === month;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  className={`flex items-start justify-start border-l border-edge text-left ${inMonth ? "" : "bg-base/40"} ${selectedDay === key ? "bg-accent-soft/50" : "hover:bg-base/60"}`}
                  style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
                  onClick={() => onSelectDay(key)}
                  aria-label={day.toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" })}
                  aria-pressed={selectedDay === key}
                >
                  <span
                    className={`m-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs ${
                      isToday ? "bg-accent font-bold text-white" : inMonth ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
            {bars.map((bar) => (
              <EventBar key={`${bar.event.event_id ?? bar.event.feed_id}-${bar.event.start}-${bar.col}`} bar={bar} dateLocale={dateLocale} busy={t("calendar.busy")} onClick={() => onSelectDay(keys[bar.col])} />
            ))}
            {more.map((n, i) =>
              n > 0 ? (
                <button key={`more-${i}`} className="relative z-10 px-1.5 text-left text-[11px] font-semibold text-muted hover:underline" style={{ gridColumn: i + 2, gridRow: LANES + 2 }} onClick={() => onSelectDay(keys[i])}>
                  {t("calendar.more", { n })}
                </button>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}
