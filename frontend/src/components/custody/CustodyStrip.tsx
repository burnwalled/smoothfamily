"use client";

// The weeks ahead for a child with two homes: a square per day, filled when here, outlined when in
// the other home, a row per week (2.7.5). Used in the app and on the other parent's link.
import { useI18n } from "@/lib/i18n";

export type CustodyDay = { date: string; place: "here" | "other" | string };

export default function CustodyStrip({ days, color, otherHome, weeks = 4 }: { days: CustodyDay[]; color: string; otherHome: string; weeks?: number }) {
  const { t, dateLocale } = useI18n();
  if (days.length === 0) return null;
  // Start the rows on the Monday of the first day's week.
  const first = new Date(`${days[0].date}T12:00:00`);
  const pad = (first.getDay() + 6) % 7;
  const cells: (CustodyDay | null)[] = [...Array.from({ length: pad }, () => null), ...days].slice(0, weeks * 7);
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i}>{new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale, { weekday: "narrow" })}</span>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-7 gap-1">
          {row.map((day, i) =>
            day ? (
              <span
                key={day.date}
                className="grid h-7 place-items-center rounded-md border-2 text-[11px] font-semibold"
                style={day.place === "here" ? { background: color, borderColor: color, color: "white" } : { borderColor: color, color }}
                title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })} – ${day.place === "here" ? t("custody.here") : otherHome}`}
              >
                {new Date(`${day.date}T12:00:00`).getDate()}
              </span>
            ) : (
              <span key={`pad-${i}`} />
            ),
          )}
        </div>
      ))}
      <p className="flex flex-wrap gap-3 pt-1 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: color }} />{t("custody.here")}</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border-2" style={{ borderColor: color }} />{otherHome}</span>
      </p>
    </div>
  );
}
