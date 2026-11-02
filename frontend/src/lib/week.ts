export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function endOfIsoWeek(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

function fmtDayMonth(date: Date, locale: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? String(date.getDate());
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return { day, month };
}

export function formatIsoWeekRange(weekStart: Date, locale: string): string {
  const weekEnd = endOfIsoWeek(weekStart);
  const a = fmtDayMonth(weekStart, locale);
  const b = fmtDayMonth(weekEnd, locale);
  if (a.month === b.month) return `${a.day}-${b.day} ${b.month}`;
  return `${a.day} ${a.month}-${b.day} ${b.month}`;
}
