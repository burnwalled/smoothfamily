"use client";

// Today card (2.7.5): where each child with two homes is today, and the next handover.
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

type Row = { user_id: string; name: string; color: string; other_home: string; place: "here" | "other"; next_handover: string | null; next_place: "here" | "other" | null; handover_time: string };

export default function CustodyWidget() {
  const { t, dateLocale } = useI18n();
  const custody = useApi<Row[]>("/api/custody");
  const rows = custody.data ?? (custody.isError ? NONE : null);
  if (rows === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted"><Link href="/calendar/custody" className="underline">{t("custody.widgetEmpty")}</Link></p>;
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long" });
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.user_id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="h-2.5 w-2.5 self-center rounded-full" style={{ background: r.color }} aria-hidden />
          <span className="font-semibold">{r.place === "here" ? t("custody.childHere", { name: r.name }) : t("custody.childAway", { name: r.name, home: r.other_home })}</span>
          {r.next_handover && (
            <span className="text-xs text-muted">{t(r.next_place === "other" ? "custody.nextAway" : "custody.nextHome", { home: r.other_home, day: day(r.next_handover), time: r.handover_time })}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
