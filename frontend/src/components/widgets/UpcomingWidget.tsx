"use client";

// Today card (2.7.0): what is coming up in Vehicles and Property – inspection, service, tyre change,
// the smoke alarm … – the next 30 days, late ones first.
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type Upcoming = {
  source: "vehicle" | "property";
  id: string;
  title: string;
  where: string;
  due_date: string | null;
  days_left: number | null;
  left: number | null;
  unit: string | null;
  status: "overdue" | "soon" | "ok";
};

export default function UpcomingWidget() {
  const { t, dateLocale } = useI18n();
  const upcoming = useApi<Upcoming[]>("/api/dashboard/upcoming");
  const rows = upcoming.data ?? (upcoming.isError ? NONE : null);
  if (rows === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted">{t("upcoming.nothing")}</p>;
  const when = (r: Upcoming) => {
    const parts: string[] = [];
    if (r.days_left !== null) {
      parts.push(
        r.days_left < 0 ? t("vehicles.overdueDays", { n: -r.days_left }) : r.days_left === 0 ? t("vehicles.dueToday") : r.days_left <= 14 ? t("vehicles.inDays", { n: r.days_left })
          : new Date(`${r.due_date}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" }),
      );
    }
    if (r.left !== null) parts.push(r.left < 0 ? t("vehicles.kmOver", { km: `${(-r.left).toLocaleString(dateLocale)} ${r.unit}` }) : t("vehicles.kmLeft", { km: `${r.left.toLocaleString(dateLocale)} ${r.unit}` }));
    return parts.join(" · ");
  };
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id}>
          <Link href={r.source === "vehicle" ? "/vehicles" : "/property"} className="flex items-baseline justify-between gap-2 text-sm hover:underline">
            <span className="min-w-0 truncate">
              <span aria-hidden>{r.source === "vehicle" ? "🚗 " : "🏠 "}</span>
              <span className="font-semibold">{r.title}</span> <span className="text-muted">· {r.where}</span>
            </span>
            <span className={`shrink-0 text-xs ${r.status === "overdue" ? "font-semibold text-red-700" : r.status === "soon" ? "text-amber-800" : "text-muted"}`}>{when(r)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
