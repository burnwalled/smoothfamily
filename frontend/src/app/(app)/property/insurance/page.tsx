"use client";

// The home insurance list (2.8.4): the things in one home and the receipts for it – value, when
// bought, warranty – to print or save as a PDF, before a burglary or a fire rather than after.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { api, Property, PropertyItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import type { ReceiptRow } from "@/components/vault/Receipts";

export default function InsurancePage() {
  return (
    <Suspense>
      <InsuranceList />
    </Suspense>
  );
}

function InsuranceList() {
  const { t, dateLocale } = useI18n();
  const id = useSearchParams().get("id") ?? "";
  const home = (useApi<Property[]>(id ? "/api/property/properties" : null).data ?? NONE).find((p) => p.id === id) ?? null;
  const items = useApi<PropertyItem[]>(id ? `/api/property/items?property_id=${id}` : null).data ?? NONE;
  const receipts = useApi<ReceiptRow[]>(id ? `/api/receipts?property_id=${id}` : null).data ?? NONE;

  const day = (iso: string | null | undefined) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale) : "");
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : Number(v).toLocaleString(dateLocale, { maximumFractionDigits: 0 }));
  const total = items.reduce((s, i) => s + (Number(i.price) || 0), 0) + receipts.filter((r) => !r.returned_at).reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 print:max-w-none">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="flex min-h-10 items-center text-2xl font-extrabold tracking-tight">{t("insurance.title", { home: home?.name ?? "" })}</h1>
          <p className="text-sm text-muted">{t("insurance.made", { date: new Date().toLocaleDateString(dateLocale) })}</p>
        </div>
        <button className="btn-primary print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />
          {t("insurance.print")}
        </button>
      </div>
      <p className="text-sm text-muted print:hidden">{t("insurance.hint")}</p>

      <section>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("property.things")}</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr><th className="py-1">{t("insurance.what")}</th><th>{t("insurance.room")}</th><th>{t("insurance.model")}</th><th>{t("insurance.bought")}</th><th className="text-right">{t("insurance.price")}</th><th>{t("insurance.warranty")}</th></tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="py-1 font-semibold">{i.name}</td>
                <td>{i.room}</td>
                <td>{[i.brand, i.model, i.serial && `#${i.serial}`].filter(Boolean).join(" ")}</td>
                <td>{day(i.bought)}</td>
                <td className="text-right tabular-nums">{num(i.price)}</td>
                <td>{day(i.warranty_until)}{i.receipt_media_id ? ` · ${t("insurance.receiptKept")}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {receipts.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("receipts.title")}</h2>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-edge">
              {receipts.filter((r) => !r.returned_at).map((r) => (
                <tr key={r.id}>
                  <td className="py-1">{day(r.purchased_on)}</td>
                  <td className="font-semibold">{r.store}</td>
                  <td>{r.note}</td>
                  <td className="text-right tabular-nums">{num(r.amount)}</td>
                  <td>{r.warranty_until ? t("receipts.warrantyTo", { date: day(r.warranty_until) }) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-sm font-semibold">{t("insurance.total", { total: num(total) })}</p>
    </div>
  );
}
