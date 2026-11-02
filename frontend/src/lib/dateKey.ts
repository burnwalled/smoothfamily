import type { CalendarEvent } from "@/lib/api";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Days an event covers: all-day ones end exclusively at midnight, timed ones on their last minute.
export function eventDayKeys(e: CalendarEvent): string[] {
  const start = new Date(e.start);
  const end = new Date(e.end);
  const keys: string[] = [];
  if (e.all_day) {
    for (let ms = start.getTime(); ms < end.getTime() && keys.length < 62; ms += DAY_MS) {
      keys.push(new Date(ms).toISOString().slice(0, 10));
    }
  } else {
    const last = toLocalDateKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
    const d = new Date(start);
    while (keys.length < 62) {
      const key = toLocalDateKey(d);
      keys.push(key);
      if (key >= last) break;
      d.setDate(d.getDate() + 1);
    }
  }
  return keys.length > 0 ? keys : [toLocalDateKey(start)];
}
