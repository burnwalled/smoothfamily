"use client";

// The other parent's page (2.8.4): what the family bought for the children that the two homes
// share, and their part – amounts and shops only, no photos or notes.
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Cost = { purchased_on: string | null; store: string; category: string; amount: number; currency: string; split_pct: number; their_part: number; child_name: string | null };

export default function CoparentCosts() {
  const { t, dateLocale } = useI18n();
  const [costs, setCosts] = useState<Cost[]>([]);

  useEffect(() => {
    fetch("/api/coparent/costs", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : [])).then(setCosts).catch(() => setCosts([]));
  }, []);

  if (costs.length === 0) return null;
  const total = costs.reduce((sum, c) => sum + c.their_part, 0);
  return (
    <section className="card p-5" aria-label={t("receipts.sharedTitle")}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("receipts.sharedTitle")}</h2>
      <ul className="divide-y divide-edge text-sm">
        {costs.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
            <span className="text-xs text-muted">{c.purchased_on ? new Date(`${c.purchased_on}T12:00:00`).toLocaleDateString(dateLocale) : ""}</span>
            <span className="min-w-0 flex-1 truncate">{[c.store, c.child_name].filter(Boolean).join(" · ")}</span>
            <span className="tabular-nums text-muted">{c.amount.toLocaleString(dateLocale)} {c.currency}</span>
            <span className="font-semibold tabular-nums">{t("receipts.theirPart", { amount: `${c.their_part.toLocaleString(dateLocale)} ${c.currency}`.trim() })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm font-semibold">{t("receipts.yourTotal", { amount: total.toLocaleString(dateLocale, { maximumFractionDigits: 2 }) })}</p>
    </section>
  );
}
