"use client";

// A vehicle's history to show a buyer (2.6.0): what it is, the service history, the meter over time
// and the tyres – on a plain page made for printing (or "Save as PDF"). Amounts only if chosen.
// Outside the app's frame so nothing else is printed; the member's own session reads the data.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { VehicleCard, VehicleExpense, VehicleMileage, VehicleTyre } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { kindInfo, kindLabel } from "@/lib/vehicleKinds";
import { useFormat } from "@/lib/vehicleFormat";

// What a buyer wants to see: looking after it, not parking and fuel.
const HISTORY = new Set(["service", "repair", "tyres", "other"]);

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!resp.ok) throw new Error(String(resp.status));
  return resp.json();
}

export default function VehicleReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [card, setCard] = useState<VehicleCard | null>(null);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [readings, setReadings] = useState<VehicleMileage[]>([]);
  const [tyres, setTyres] = useState<VehicleTyre[]>([]);
  const [amounts, setAmounts] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      get<VehicleCard[]>("/api/vehicles/overview"),
      get<VehicleExpense[]>(`/api/vehicles/expenses?vehicle_id=${id}`),
      get<VehicleMileage[]>(`/api/vehicles/${id}/mileage`),
      get<VehicleTyre[]>(`/api/vehicles/${id}/tyres`).catch(() => []),
    ])
      .then(([cards, rows, meter, sets]) => {
        setCard(cards.find((c) => c.vehicle.id === id) ?? null);
        setExpenses(rows);
        setReadings(meter);
        setTyres(sets);
      })
      .catch(() => setError(true));
  }, [id]);

  const fmt = useFormat(card?.currency ?? "kr", card?.vehicle.meter ?? "km");
  if (error) return <p className="p-8">{t("vehicles.reportError")}</p>;
  if (!card) return <p className="p-8 text-muted">{t("common.loading")}</p>;
  const v = card.vehicle;
  const history = expenses.filter((e) => HISTORY.has(e.category)).sort((a, b) => a.expense_date.localeCompare(b.expense_date));
  const done = card.reminders.filter((r) => r.last_done);
  const first = readings[readings.length - 1];
  const last = readings[0];
  const all = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-white p-8 text-black print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={amounts} onChange={(e) => setAmounts(e.target.checked)} />
          {t("vehicles.reportAmounts")}
        </label>
        <button className="btn-primary inline-flex items-center gap-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />
          {t("vehicles.print")}
        </button>
      </div>

      <header className="border-b border-gray-300 pb-4">
        <h1 className="flex items-center gap-2 text-3xl font-extrabold">
          <span aria-hidden>{kindInfo(v.kind).icon}</span>
          {v.name}
        </h1>
        <p className="mt-1 text-gray-600">{[t(kindLabel(v.kind ?? "car")), v.make, v.model, v.year, v.registration].filter(Boolean).join(" · ")}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {v.mileage !== null && v.meter !== "none" && (
            <div><dt className="text-gray-500">{v.meter === "hours" ? t("vehicles.meterHours") : t("vehicles.odometerKm")}</dt><dd className="font-semibold">{fmt.reading(v.mileage)}</dd></div>
          )}
          {v.fuel && <div><dt className="text-gray-500">{t("vehicles.field.fuel")}</dt><dd className="font-semibold">{t(`vehicles.fuel.${v.fuel}` as TranslationKey)}</dd></div>}
          {v.purchase_date && <div><dt className="text-gray-500">{t("vehicles.field.purchaseDate")}</dt><dd className="font-semibold">{fmt.day(v.purchase_date)}</dd></div>}
          {card.consumption !== null && card.consumption_unit && (
            <div><dt className="text-gray-500">{t("vehicles.consumption")}</dt><dd className="font-semibold">{fmt.consumption(card.consumption, card.consumption_unit)}</dd></div>
          )}
        </dl>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-bold">{t("vehicles.reportHistory")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-600">{t("vehicles.reportNoHistory")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-500">
                <th className="py-1">{t("vehicles.date")}</th>
                <th className="py-1">{t("vehicles.reportWhat")}</th>
                {v.meter !== "none" && <th className="py-1 text-right">{fmt.unit}</th>}
                {amounts && <th className="py-1 text-right">{t("vehicles.amountPh")}</th>}
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="py-1 pr-2 whitespace-nowrap">{fmt.day(e.expense_date)}</td>
                  <td className="py-1 pr-2">{e.name} <span className="text-gray-500">({t(`vehicles.cat.${e.category}` as TranslationKey)})</span>{e.receipt_media_id && " 🧾"}</td>
                  {v.meter !== "none" && <td className="py-1 text-right tabular-nums">{e.mileage_at?.toLocaleString() ?? ""}</td>}
                  {amounts && <td className="py-1 text-right tabular-nums">{fmt.money(e.amount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {done.length > 0 && (
          <ul className="mt-3 text-sm">
            {done.map((r) => (
              <li key={r.id}>✓ {r.title || t(`vehicles.kind.${r.kind}` as TranslationKey)} – {fmt.day(r.last_done!)}{r.due_date && ` · ${t("vehicles.reportNext", { date: fmt.day(r.due_date) })}`}</li>
            ))}
          </ul>
        )}
      </section>

      {readings.length > 1 && first && last && v.meter !== "none" && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{v.meter === "hours" ? t("vehicles.tab.hours") : t("vehicles.tab.odometer")}</h2>
          <p className="text-sm">{t("vehicles.reportReadings", { n: readings.length, from: fmt.reading(first.mileage), fromDate: fmt.day(first.reading_date), to: fmt.reading(last.mileage), toDate: fmt.day(last.reading_date) })}</p>
        </section>
      )}

      {tyres.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("vehicles.tab.tyres")}</h2>
          <ul className="text-sm">
            {tyres.map((s) => (
              <li key={s.id}>
                {s.name || t(`vehicles.season.${s.season}` as TranslationKey)} ({t(`vehicles.season.${s.season}` as TranslationKey)}){s.size && ` · ${s.size}`}
                {s.tread_mm !== null && ` · ${t("vehicles.tread", { mm: s.tread_mm })}`}{s.mounted && ` · ${t("vehicles.tyresOn")}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {amounts && (
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("vehicles.reportCosts")}</h2>
          <p className="text-sm">{t("vehicles.reportTotal", { amount: fmt.money(all) })}</p>
        </section>
      )}

      <footer className="border-t border-gray-300 pt-3 text-xs text-gray-500">{t("vehicles.reportFooter", { date: fmt.day(new Date().toISOString().slice(0, 10)) })}</footer>
    </main>
  );
}
