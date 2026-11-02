"use client";

// Today card for the Pantry: what to use first (within 3 days of its date, or past it).
import { PantryItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";

/** Today card: what to use first. */
export default function PantrySoonWidget() {
  const { t, dateLocale } = useI18n();
  const soon = useApi<PantryItem[]>("/api/pantry/soon");
  const items = soon.data ?? (soon.isError ? NONE : null);
  if (items === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (items.length === 0) return <p className="text-sm text-muted">{t("pantry.nothingSoon")}</p>;
  return (
    <ul className="space-y-1">
      {items.slice(0, 6).map((i) => (
        <li key={i.id} className={`flex justify-between gap-2 text-sm ${i.status === "expired" ? "text-red-700" : ""}`}>
          <span className="truncate">{i.name}</span>
          <span className="shrink-0 text-xs text-muted">{i.best_before && new Date(`${i.best_before}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}</span>
        </li>
      ))}
    </ul>
  );
}
