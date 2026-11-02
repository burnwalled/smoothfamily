// Where events go in the month and week grids (2.7.0): bars across the days of a week row, in
// lanes so they don't overlap, and timed events side by side in a day's column when they clash.
import type { CalendarEvent } from "@/lib/api";
import { eventDayKeys } from "@/lib/dateKey";

export type Bar = {
  event: CalendarEvent;
  // Day index in the week (0 = Monday) and how many days it covers there.
  col: number;
  span: number;
  lane: number;
  // It started before this week / goes on after it.
  fromBefore: boolean;
  goesOn: boolean;
};

/** Spans more than one day (or is all-day): shown as a bar, not at a time. */
export const isLong = (e: CalendarEvent) => e.all_day || eventDayKeys(e).length > 1;

/**
 * The bars of one week row: long events first (longest, earliest), then the day's timed ones by
 * start time, each in the first lane free over all its days. `lanes` caps how many are shown; the
 * rest are counted per day in `more`.
 */
export function weekBars(events: CalendarEvent[], dayKeys: string[], lanes: number, only?: (e: CalendarEvent) => boolean): { bars: Bar[]; more: number[] } {
  const rows = events
    .filter((e) => !only || only(e))
    .map((event) => {
      const keys = eventDayKeys(event);
      const inWeek = dayKeys.map((k, i) => (keys.includes(k) ? i : -1)).filter((i) => i >= 0);
      return { event, keys, inWeek };
    })
    .filter((r) => r.inWeek.length > 0)
    .sort((a, b) => {
      const longA = isLong(a.event), longB = isLong(b.event);
      if (longA !== longB) return longA ? -1 : 1;
      if (a.inWeek[0] !== b.inWeek[0]) return a.inWeek[0] - b.inWeek[0];
      if (longA && b.inWeek.length !== a.inWeek.length) return b.inWeek.length - a.inWeek.length;
      return a.event.start.localeCompare(b.event.start);
    });
  const taken: boolean[][] = [];
  const bars: Bar[] = [];
  const more = dayKeys.map(() => 0);
  for (const { event, keys, inWeek } of rows) {
    const col = inWeek[0];
    const span = inWeek[inWeek.length - 1] - col + 1;
    let lane = 0;
    while (lane < lanes && Array.from({ length: span }, (_, i) => taken[lane]?.[col + i]).some(Boolean)) lane += 1;
    if (lane >= lanes) {
      inWeek.forEach((i) => (more[i] += 1));
      continue;
    }
    taken[lane] = taken[lane] ?? [];
    for (let i = 0; i < span; i++) taken[lane][col + i] = true;
    bars.push({ event, col, span, lane, fromBefore: keys[0] < dayKeys[0], goesOn: keys[keys.length - 1] > dayKeys[dayKeys.length - 1] });
  }
  return { bars, more };
}

export type Placed = { event: CalendarEvent; top: number; height: number; column: number; columns: number };

/**
 * A day's timed events in its column: minutes from `fromHour` (clamped to the day), and side by
 * side within each group of events that overlap.
 */
export function placeTimed(events: CalendarEvent[], day: Date, fromHour: number, toHour: number): Placed[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), fromHour).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), toHour).getTime();
  const items = events
    .map((event) => {
      const start = Math.max(new Date(event.start).getTime(), dayStart);
      const end = Math.min(Math.max(new Date(event.end).getTime(), new Date(event.start).getTime() + 30 * 60_000), dayEnd);
      return { event, start, end };
    })
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed[] = [];
  let group: { item: (typeof items)[number]; column: number }[] = [];
  let groupEnd = 0;
  const flush = () => {
    const columns = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) {
      out.push({ event: g.item.event, top: (g.item.start - dayStart) / 60_000, height: (g.item.end - g.item.start) / 60_000, column: g.column, columns });
    }
    group = [];
  };
  for (const item of items) {
    if (group.length && item.start >= groupEnd) flush();
    // The first column whose last event has ended.
    const used = new Set(group.filter((g) => g.item.end > item.start).map((g) => g.column));
    let column = 0;
    while (used.has(column)) column += 1;
    group.push({ item, column });
    groupEnd = Math.max(groupEnd, item.end);
  }
  if (group.length) flush();
  return out;
}

/** The hours to show: 07–22, widened to fit the week's earliest and latest event. */
export function hourRange(events: CalendarEvent[]): [number, number] {
  let from = 7;
  let to = 22;
  for (const e of events) {
    if (isLong(e)) continue;
    from = Math.min(from, new Date(e.start).getHours());
    const end = new Date(e.end);
    to = Math.max(to, end.getHours() + (end.getMinutes() ? 1 : 0));
  }
  return [Math.max(0, from), Math.min(24, to)];
}
