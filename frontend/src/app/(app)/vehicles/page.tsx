"use client";

// Vehicles (2.6.0): anything the family keeps going – car, bike, boat, jet ski, tractor, mower,
// robot … A card per vehicle with what matters now (the next inspection, service, tyre change,
// launch or winter storage; this year's costs against last year; the consumption) and, for the
// chosen one, its reminders, costs, meter (km or engine hours), tyres, documents and settings. A
// receipt photo or a service history PDF can be read by the local AI; everything works by hand too.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, Download, FileText, Gauge, Plus, Printer, Search, Trash2 } from "lucide-react";
import {
  api,
  Member,
  ReminderKind,
  Vehicle,
  VehicleCard,
  VehicleExpense,
  VehicleFuel,
  VehicleMileage,
  VehicleReminder,
  VehicleTyre,
  VehicleDocument,
} from "@/lib/api";
import ReceiptPicker from "@/components/ReceiptPicker";
import WebSearch, { useWebSearch } from "@/components/WebSearch";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import { AiJob, AiNote, useAiJob, useAiStatus } from "@/components/LocalAi";
import { uploadReceipt } from "@/lib/receipts";
import { KIND_ORDER, kindInfo, kindLabel, Meter, nextDay, Suggestion, suggestionLabel, VehicleKind } from "@/lib/vehicleKinds";
import { useFormat } from "@/lib/vehicleFormat";

const CATEGORIES = ["fuel", "charging", "service", "repair", "tyres", "insurance", "tax", "parking", "toll", "other"] as const;
const FUELS: VehicleFuel[] = ["petrol", "diesel", "electric", "hybrid", "plugin", "gas", "other"];
const KINDS: ReminderKind[] = ["inspection", "service", "tyres", "insurance", "tax", "storage", "battery", "warranty", "other"];
const SEASONS = ["summer", "winter", "studded", "allyear"] as const;
const today = () => new Date().toISOString().slice(0, 10);
const num = (value: string) => (value.trim() ? Number(value.replace(",", ".").replace(/\s/g, "")) : null);
const charges = (fuel: string | null | undefined) => fuel === "electric" || fuel === "plugin";

// Family admin: who may see a vehicle, its expenses and exports. None ticked = everyone with the
// Vehicles app; admins always see every vehicle.
function VehicleAccess({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useI18n();
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [error, setError] = useState("");

  const others = members.filter((m) => m.role !== "admin");
  const allowed = vehicle.allowed_user_ids ?? [];

  async function toggle(id: string) {
    setError("");
    const next = allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id];
    try {
      await api.put<Vehicle>(`/api/vehicles/${vehicle.id}/access`, { allowed_user_ids: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="rounded-lg border border-edge p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("vehicles.accessTitle", { name: vehicle.name })}</p>
      <p className="mt-1 text-xs text-muted">{allowed.length === 0 ? t("vehicles.accessEveryone") : t("vehicles.accessSome")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {others.map((m) => (
          <label key={m.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-edge px-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={allowed.includes(m.id)} onChange={() => toggle(m.id)} />
            {m.display_name}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function meterLabel(t: ReturnType<typeof useI18n>["t"], meter: string) {
  return meter === "hours" ? t("vehicles.meterHours") : t("vehicles.odometerKm");
}

function reminderText(r: VehicleReminder, t: ReturnType<typeof useI18n>["t"], fmt: ReturnType<typeof useFormat>) {
  const parts: string[] = [];
  if (r.due_date) {
    parts.push(
      r.days_left !== null && r.days_left < 0
        ? t("vehicles.overdueDays", { n: -r.days_left })
        : r.days_left === 0
          ? t("vehicles.dueToday")
          : r.days_left !== null && r.days_left <= 60
            ? t("vehicles.inDays", { n: r.days_left })
            : fmt.day(r.due_date),
    );
  }
  if (r.due_mileage !== null) {
    parts.push(r.km_left !== null ? (r.km_left < 0 ? t("vehicles.kmOver", { km: fmt.reading(-r.km_left) }) : t("vehicles.kmLeft", { km: fmt.reading(r.km_left) })) : t("vehicles.atKm", { km: fmt.reading(r.due_mileage) }));
  }
  return parts.join(" · ");
}

const STATUS_CLASS = { overdue: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-900", ok: "bg-base text-muted" };

function ReminderChip({ r, fmt }: { r: VehicleReminder; fmt: ReturnType<typeof useFormat> }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[r.status]}`}>
      {r.title || t(`vehicles.kind.${r.kind}` as TranslationKey)}
      <span className="font-normal">{reminderText(r, t, fmt)}</span>
    </span>
  );
}

function OverviewCard({ card, active, onOpen }: { card: VehicleCard; active: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const v = card.vehicle;
  const fmt = useFormat(card.currency, v.meter);
  const diff = card.cost_this_year - card.cost_last_year_to_date;
  return (
    <li>
      <button className={`card w-full space-y-2 p-4 text-left ${active ? "ring-2 ring-accent" : ""}`} onClick={onOpen} aria-pressed={active}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 text-lg font-bold">
            <span aria-hidden>{kindInfo(v.kind).icon}</span>
            {v.name}
          </p>
          {v.registration && <p className="font-mono text-sm text-muted">{v.registration}</p>}
        </div>
        <p className="text-xs text-muted">
          {[t(kindLabel(v.kind ?? "car")), v.make, v.model, v.year].filter(Boolean).join(" · ")}
          {v.mileage !== null && v.meter !== "none" && <> · {fmt.reading(v.mileage)}</>}
          {card.tyres_on && <> · {t(`vehicles.season.${card.tyres_on}` as TranslationKey)}</>}
        </p>
        {card.reminders.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {card.reminders.slice(0, 3).map((r) => <ReminderChip key={r.id} r={r} fmt={fmt} />)}
          </div>
        ) : (
          <p className="text-xs text-muted">{t("vehicles.noReminders")}</p>
        )}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t("vehicles.costThisYear")}</dt>
            <dd className="font-semibold">{fmt.money(card.cost_this_year)}</dd>
            {card.cost_last_year_to_date > 0 && (
              <dd className={`text-xs ${diff > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {t(diff > 0 ? "vehicles.moreThanLastYear" : "vehicles.lessThanLastYear", { amount: fmt.money(Math.abs(diff)) })}
              </dd>
            )}
          </div>
          {card.consumption !== null && card.consumption_unit && (
            <div>
              <dt className="text-xs text-muted">{t("vehicles.consumption")}</dt>
              <dd className="font-semibold">{fmt.consumption(card.consumption, card.consumption_unit)}</dd>
            </div>
          )}
          {card.cost_per_km !== null && (
            <div>
              <dt className="text-xs text-muted">{v.meter === "hours" ? t("vehicles.costPerHour") : t("vehicles.costPerKm")}</dt>
              <dd className="font-semibold">{card.cost_per_km.toLocaleString(undefined, { maximumFractionDigits: 2 })} {card.currency}/{fmt.unit}</dd>
            </div>
          )}
          {card.ownership_cost !== null && (
            <div>
              <dt className="text-xs text-muted">{t("vehicles.ownershipCost")}</dt>
              <dd className="font-semibold">{fmt.money(card.ownership_cost)}</dd>
            </div>
          )}
        </dl>
      </button>
    </li>
  );
}

type ReminderForm = { id: string; kind: ReminderKind; title: string; due_date: string; due_mileage: string; repeat_months: string; repeat_km: string; remind_days: string };

function RemindersTab({ vehicle, reminders, currency }: { vehicle: Vehicle; reminders: VehicleReminder[]; currency: string }) {
  const { t } = useI18n();
  const meter = vehicle.meter ?? "km";
  const fmt = useFormat(currency, meter);
  const info = kindInfo(vehicle.kind);
  const blank: ReminderForm = { id: "", kind: "service", title: "", due_date: "", due_mileage: "", repeat_months: "12", repeat_km: "", remind_days: "14" };
  const [form, setForm] = useState<ReminderForm | null>(null);
  const [doneFor, setDoneFor] = useState<{ id: string; date: string; mileage: string } | null>(null);
  const [error, setError] = useState("");
  const counted = meter !== "none";

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function suggest(s: Suggestion) {
    const step = counted && s.step ? s.step : null;
    setForm({
      ...blank, kind: s.kind, title: t(suggestionLabel(s.key)),
      due_date: s.day ? nextDay(s.day) : step ? "" : today(),
      due_mileage: step && vehicle.mileage !== null ? String(vehicle.mileage + step) : "",
      repeat_months: s.months ? String(s.months) : "", repeat_km: step ? String(step) : "",
    });
  }

  function save() {
    if (!form) return;
    const body = {
      vehicle_id: vehicle.id, kind: form.kind, title: form.title.trim(), due_date: form.due_date || null, due_mileage: counted ? num(form.due_mileage) : null,
      repeat_months: num(form.repeat_months), repeat_km: counted ? num(form.repeat_km) : null, remind_days: num(form.remind_days) ?? 14,
    };
    return run(async () => {
      if (form.id) await api.patch(`/api/vehicles/reminders/${form.id}`, body);
      else await api.post("/api/vehicles/reminders", body);
      setForm(null);
    });
  }

  // Suggestions not already there (by name).
  const titles = new Set(reminders.map((r) => r.title));
  const suggestions = info.suggestions.filter((s) => !titles.has(t(suggestionLabel(s.key))));

  return (
    <div className="space-y-3">
      {reminders.length === 0 && !form && <EmptyState>{t("vehicles.remindersEmpty")}</EmptyState>}
      <ul className="space-y-2">
        {reminders.map((r) => (
          <li key={r.id} className="rounded-lg border border-edge p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ReminderChip r={r} fmt={fmt} />
              <span className="text-xs text-muted">
                {[
                  r.due_date && fmt.day(r.due_date),
                  r.due_mileage !== null && counted && fmt.reading(r.due_mileage),
                  (r.repeat_months || r.repeat_km) &&
                    t("vehicles.repeats", { every: [r.repeat_months && t("vehicles.months", { n: r.repeat_months }), r.repeat_km && counted && fmt.reading(r.repeat_km)].filter(Boolean).join(t("vehicles.or")) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="ml-auto flex gap-2">
                <button className="btn-primary px-3 py-1 text-sm" onClick={() => setDoneFor({ id: r.id, date: today(), mileage: vehicle.mileage !== null ? String(vehicle.mileage) : "" })}>
                  {t("vehicles.markDone")}
                </button>
                <button
                  className="btn-ghost border border-edge px-3 py-1 text-sm"
                  onClick={() =>
                    setForm({
                      id: r.id, kind: r.kind, title: r.title, due_date: r.due_date ?? "", due_mileage: r.due_mileage?.toString() ?? "",
                      repeat_months: r.repeat_months?.toString() ?? "", repeat_km: r.repeat_km?.toString() ?? "", remind_days: String(r.remind_days),
                    })
                  }
                >
                  {t("vehicles.change")}
                </button>
                <button className="btn-ghost px-2 text-red-700" onClick={() => run(() => api.del(`/api/vehicles/reminders/${r.id}`))} aria-label={t("vehicles.removeReminder")}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </span>
            </div>
            {doneFor?.id === r.id && (
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api.post(`/api/vehicles/reminders/${r.id}/done`, { done_date: doneFor.date, mileage: counted ? num(doneFor.mileage) : null });
                    setDoneFor(null);
                  });
                }}
              >
                <label className="text-sm">
                  <span className="text-xs text-muted">{t("vehicles.doneOn")}</span>
                  <input className="input mt-1 block" type="date" value={doneFor.date} onChange={(e) => setDoneFor({ ...doneFor, date: e.target.value })} />
                </label>
                {counted && (
                  <label className="text-sm">
                    <span className="text-xs text-muted">{meterLabel(t, meter)}</span>
                    <input className="input mt-1 block w-32" inputMode="numeric" value={doneFor.mileage} onChange={(e) => setDoneFor({ ...doneFor, mileage: e.target.value })} />
                  </label>
                )}
                <button className="btn-primary">{t("vehicles.saveDone")}</button>
                <button type="button" className="btn-ghost" onClick={() => setDoneFor(null)}>{t("common.cancel")}</button>
                <p className="w-full text-xs text-muted">{r.repeat_months || r.repeat_km ? t("vehicles.doneNext") : t("vehicles.doneOnce")}</p>
              </form>
            )}
          </li>
        ))}
      </ul>

      {form ? (
        <form
          className="space-y-3 rounded-lg border border-edge p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.reminderKind")}</span>
              <select className="input mt-1 w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ReminderKind })}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`vehicles.kind.${k}` as TranslationKey)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.reminderTitle")}</span>
              <input className="input mt-1 w-full" value={form.title} maxLength={120} placeholder={t(`vehicles.kind.${form.kind}` as TranslationKey)} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.dueDate")}</span>
              <input className="input mt-1 w-full" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </label>
            {counted && (
              <label className="text-sm">
                <span className="text-xs text-muted">{meter === "hours" ? t("vehicles.dueHours") : t("vehicles.dueKm")}</span>
                <input className="input mt-1 w-full" inputMode="numeric" value={form.due_mileage} onChange={(e) => setForm({ ...form, due_mileage: e.target.value })} />
              </label>
            )}
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.repeatMonths")}</span>
              <input className="input mt-1 w-full" inputMode="numeric" value={form.repeat_months} onChange={(e) => setForm({ ...form, repeat_months: e.target.value })} />
            </label>
            {counted && (
              <label className="text-sm">
                <span className="text-xs text-muted">{meter === "hours" ? t("vehicles.repeatHours") : t("vehicles.repeatKm")}</span>
                <input className="input mt-1 w-full" inputMode="numeric" value={form.repeat_km} onChange={(e) => setForm({ ...form, repeat_km: e.target.value })} />
              </label>
            )}
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.remindDays")}</span>
              <input className="input mt-1 w-full" inputMode="numeric" value={form.remind_days} onChange={(e) => setForm({ ...form, remind_days: e.target.value })} />
            </label>
          </div>
          <p className="text-xs text-muted">{t("vehicles.reminderHelp")}</p>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!form.due_date && !form.due_mileage.trim()}>{t("vehicles.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted">{t("vehicles.suggestions", { kind: t(kindLabel(vehicle.kind ?? "car")).toLowerCase() })}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s.key} className="rounded-full border border-edge px-3 py-1 text-sm hover:bg-base" onClick={() => suggest(s)}>
                    + {t(suggestionLabel(s.key))}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setForm(blank)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("vehicles.addReminder")}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

type ExpenseForm = { id: string; name: string; amount: string; expense_date: string; category: string; mileage_at: string; volume: string; charge_place: "home" | "public"; receipt_media_id: string | null };

function CostsTab({ vehicle, expenses, currency }: { vehicle: Vehicle; expenses: VehicleExpense[]; currency: string }) {
  const { t } = useI18n();
  const meter = vehicle.meter ?? "km";
  const fmt = useFormat(currency, meter);
  const info = kindInfo(vehicle.kind);
  const electric = vehicle.fuel === "electric";
  const first = info.fuel ? (electric ? "charging" : "fuel") : "service";
  const blank: ExpenseForm = { id: "", name: "", amount: "", expense_date: today(), category: first, mileage_at: "", volume: "", charge_place: "home", receipt_media_id: null };
  const [form, setForm] = useState<ExpenseForm>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const aiStatus = useAiStatus();
  const aiJob = useAiJob();
  const filling = form.category === "fuel" || form.category === "charging";
  const unit = form.category === "charging" ? "kWh" : "l";
  // Charged at home: the amount can be worked out from the kWh and the electricity price.
  const autoPrice = form.category === "charging" && form.charge_place === "home";
  const categories = CATEGORIES.filter((c) => info.fuel || charges(vehicle.fuel) || (c !== "fuel" && c !== "charging"));

  async function save() {
    const amount = num(form.amount);
    if (!form.name.trim() || (!amount && !(autoPrice && num(form.volume)))) return;
    setBusy(true);
    setError("");
    try {
      const receipt = file ? await uploadReceipt(file) : form.receipt_media_id;
      const volume = filling ? num(form.volume) : null;
      const body = {
        vehicle_id: vehicle.id, name: form.name.trim(), amount: amount || null, expense_date: form.expense_date, category: form.category,
        mileage_at: meter !== "none" ? num(form.mileage_at) : null, volume, volume_unit: volume ? unit : null,
        charge_place: form.category === "charging" ? form.charge_place : null, receipt_media_id: receipt,
      };
      if (form.id) await api.patch(`/api/vehicles/expenses/${form.id}`, body);
      else await api.post("/api/vehicles/expenses", body);
      setForm(blank);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  // A photo of the receipt: kept as the receipt, and read by the local AI when the family has it.
  async function readReceipt(photo: File) {
    await aiJob.start(async () => {
      const media = await uploadReceipt(photo);
      return api.post<AiJob>("/api/ai/jobs", { kind: "vehicle_receipt", vehicle_id: vehicle.id, media_id: media });
    });
  }

  // A service history as a PDF (from the garage or the maker's app): its text for the local AI.
  async function readPdf(pdf: File) {
    await aiJob.start(async () => {
      const data = new FormData();
      data.append("file", pdf);
      const resp = await fetch(`/api/ai/jobs/vehicle-pdf?vehicle_id=${vehicle.id}`, { method: "POST", body: data, credentials: "same-origin" });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? t("common.error"));
      return (await resp.json()) as AiJob;
    });
  }

  return (
    <div className="space-y-4">
      {aiStatus?.available && (
        <div className="space-y-1 rounded-lg border border-edge p-3">
          <div className="flex flex-wrap gap-2">
            <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${aiJob.busy ? "opacity-60" : ""}`}>
              <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("vehicles.readReceipt")}
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={aiJob.busy} onChange={(e) => { const photo = e.target.files?.[0]; e.target.value = ""; if (photo) readReceipt(photo); }} />
            </label>
            <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${aiJob.busy ? "opacity-60" : ""}`}>
              <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("vehicles.readPdf")}
              <input type="file" accept="application/pdf" className="sr-only" disabled={aiJob.busy} onChange={(e) => { const pdf = e.target.files?.[0]; e.target.value = ""; if (pdf) readPdf(pdf); }} />
            </label>
          </div>
          <p className="text-xs text-muted">{t("vehicles.pdfHelp")}</p>
          <AiNote status={aiStatus} />
          {aiJob.note}
        </div>
      )}

      <Link href="/bank-import" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">🏦 {t("bank.fromBank")}</Link>
      <form
        className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label={t("vehicles.category")}>
          {categories.map((c) => <option key={c} value={c}>{t(`vehicles.cat.${c}` as TranslationKey)}</option>)}
        </select>
        <input className="input" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t(`vehicles.namePh.${filling ? "fill" : "other"}` as TranslationKey)} aria-label={t("vehicles.expenseNamePh")} />
        {form.category === "charging" && (
          <select className="input" value={form.charge_place} onChange={(e) => setForm({ ...form, charge_place: e.target.value as "home" | "public" })} aria-label={t("vehicles.chargePlace")}>
            <option value="home">{t("vehicles.chargeHome")}</option>
            <option value="public">{t("vehicles.chargePublic")}</option>
          </select>
        )}
        <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={autoPrice ? t("vehicles.amountAuto") : t("vehicles.amountIn", { currency })} aria-label={t("vehicles.amountPh")} />
        <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} aria-label={t("vehicles.date")} />
        {meter !== "none" && (
          <input className="input" inputMode="numeric" value={form.mileage_at} onChange={(e) => setForm({ ...form, mileage_at: e.target.value })} placeholder={meterLabel(t, meter)} aria-label={meterLabel(t, meter)} />
        )}
        {filling && (
          <input className="input" inputMode="decimal" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} placeholder={t(unit === "kWh" ? "vehicles.kwh" : "vehicles.litres")} aria-label={t(unit === "kWh" ? "vehicles.kwh" : "vehicles.litres")} />
        )}
        <ReceiptPicker file={file} onChange={setFile} className="sm:col-span-2" />
        {filling && <p className="text-xs text-muted sm:col-span-2">{autoPrice ? t("vehicles.autoPriceHelp") : t("vehicles.fillHelp")}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={busy || !form.name.trim() || (!form.amount.trim() && !(autoPrice && form.volume.trim()))}>{form.id ? t("vehicles.save") : t("vehicles.addExpense")}</button>
          {form.id && <button type="button" className="btn-ghost" onClick={() => setForm(blank)}>{t("common.cancel")}</button>}
        </div>
        {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>

      {expenses.length === 0 ? (
        <EmptyState>{t("vehicles.costsEmpty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-edge">
          {expenses.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-24 text-xs text-muted">{fmt.day(row.expense_date)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{row.name}</span>{" "}
                <span className="text-xs text-muted">
                  {t(`vehicles.cat.${row.category}` as TranslationKey)}
                  {row.charge_place && <> · {t(row.charge_place === "home" ? "vehicles.chargeHome" : "vehicles.chargePublic")}</>}
                  {row.mileage_at !== null && <> · {fmt.reading(row.mileage_at)}</>}
                  {row.volume ? <> · {row.volume.toLocaleString()} {row.volume_unit}</> : null}
                  {row.receipt_media_id && <> · 🧾</>}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{fmt.money(row.amount)}</span>
              <button
                className="text-xs text-muted hover:underline"
                onClick={() =>
                  setForm({
                    id: row.id, name: row.name, amount: String(row.amount), expense_date: row.expense_date, category: row.category,
                    mileage_at: row.mileage_at?.toString() ?? "", volume: row.volume?.toString() ?? "", charge_place: row.charge_place ?? "home",
                    receipt_media_id: row.receipt_media_id,
                  })
                }
              >
                {t("vehicles.change")}
              </button>
              <button className="text-red-700" onClick={() => api.del(`/api/vehicles/expenses/${row.id}`)} aria-label={t("vehicles.removeExpense", { name: row.name })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MeterTab({ vehicle, currency }: { vehicle: Vehicle; currency: string }) {
  const { t } = useI18n();
  const meter = vehicle.meter ?? "km";
  const fmt = useFormat(currency, meter);
  const rows = useApi<VehicleMileage[]>(`/api/vehicles/${vehicle.id}/mileage`).data ?? NONE;
  const [form, setForm] = useState({ reading_date: today(), mileage: "" });
  const [error, setError] = useState("");

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const mileage = num(form.mileage);
          if (mileage === null) return;
          setError("");
          api
            .post(`/api/vehicles/${vehicle.id}/mileage`, { reading_date: form.reading_date, mileage })
            .then(() => {
              setForm({ reading_date: today(), mileage: "" });
            })
            .catch((err) => setError(err instanceof Error ? err.message : t("common.error")));
        }}
      >
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.date")}</span>
          <input className="input mt-1 block" type="date" value={form.reading_date} onChange={(e) => setForm({ ...form, reading_date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{meterLabel(t, meter)}</span>
          <input className="input mt-1 block w-36" inputMode="numeric" value={form.mileage} placeholder={vehicle.mileage !== null ? String(vehicle.mileage) : ""} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
        </label>
        <button className="btn-primary" disabled={!form.mileage.trim()}>{t("vehicles.addReading")}</button>
      </form>
      <p className="text-xs text-muted">{vehicle.ha_meter_entity ? t("vehicles.meterFromHa", { entity: vehicle.ha_meter_entity }) : t("vehicles.odometerHelp")}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-edge text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-1.5">
            <span className="w-28 text-xs text-muted">{fmt.day(r.reading_date)}</span>
            <span className="flex-1 font-semibold tabular-nums">{fmt.reading(r.mileage)}</span>
            {r.from_expense ? (
              <span className="text-xs text-muted">{t("vehicles.fromCost")}</span>
            ) : (
              <button className="text-red-700" onClick={() => api.del(`/api/vehicles/mileage/${r.id}`)} aria-label={t("vehicles.removeReading")}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TyreForm = { id: string; name: string; season: (typeof SEASONS)[number]; size: string; bought: string; tread_mm: string; storage: string };

function TyresTab({ vehicle }: { vehicle: Vehicle }) {
  const { t, dateLocale } = useI18n();
  const rows = useApi<VehicleTyre[]>(`/api/vehicles/${vehicle.id}/tyres`).data ?? NONE;
  const [form, setForm] = useState<TyreForm | null>(null);
  const [mounting, setMounting] = useState<{ id: string; date: string; mileage: string; storage: string } | null>(null);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const age = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000)) : null);
  const off = rows.find((r) => r.mounted);

  return (
    <div className="space-y-3">
      {rows.length === 0 && !form && <EmptyState>{t("vehicles.tyresEmpty")}</EmptyState>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const years = age(r.bought);
          return (
            <li key={r.id} className={`rounded-lg border p-3 ${r.mounted ? "border-accent" : "border-edge"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.name || t(`vehicles.season.${r.season}` as TranslationKey)}</span>
                <span className="rounded-full bg-base px-2 py-0.5 text-xs">{t(`vehicles.season.${r.season}` as TranslationKey)}</span>
                {r.mounted ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">
                    {t("vehicles.tyresOn")}
                    {r.mounted_at && ` · ${new Date(`${r.mounted_at}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`}
                  </span>
                ) : (
                  r.storage && <span className="text-xs text-muted">{t("vehicles.tyresKeptAt", { place: r.storage })}</span>
                )}
                <span className="ml-auto flex gap-2">
                  {!r.mounted && (
                    <button className="btn-primary px-3 py-1 text-sm" onClick={() => setMounting({ id: r.id, date: today(), mileage: vehicle.mileage !== null && vehicle.meter !== "none" ? String(vehicle.mileage) : "", storage: off?.storage ?? "" })}>
                      {t("vehicles.mount")}
                    </button>
                  )}
                  <button className="btn-ghost border border-edge px-3 py-1 text-sm" onClick={() => setForm({ id: r.id, name: r.name, season: r.season, size: r.size, bought: r.bought ?? "", tread_mm: r.tread_mm?.toString() ?? "", storage: r.storage })}>
                    {t("vehicles.change")}
                  </button>
                  <button className="btn-ghost px-2 text-red-700" onClick={() => run(() => api.del(`/api/vehicles/tyres/${r.id}`))} aria-label={t("vehicles.removeTyres")}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {[r.size, r.tread_mm !== null && t("vehicles.tread", { mm: r.tread_mm.toLocaleString(dateLocale) }), years !== null && t("vehicles.tyreAge", { n: years })].filter(Boolean).join(" · ")}
                {r.tread_mm !== null && r.tread_mm < (r.season === "summer" ? 3 : 4) && <span className="ml-2 font-semibold text-red-700">{t("vehicles.treadLow")}</span>}
              </p>
              {mounting?.id === r.id && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api.post(`/api/vehicles/tyres/${r.id}/mount`, { on_date: mounting.date, mileage: num(mounting.mileage), storage: mounting.storage });
                      setMounting(null);
                    });
                  }}
                >
                  <label className="text-sm">
                    <span className="text-xs text-muted">{t("vehicles.doneOn")}</span>
                    <input className="input mt-1 block" type="date" value={mounting.date} onChange={(e) => setMounting({ ...mounting, date: e.target.value })} />
                  </label>
                  {vehicle.meter !== "none" && (
                    <label className="text-sm">
                      <span className="text-xs text-muted">{meterLabel(t, vehicle.meter ?? "km")}</span>
                      <input className="input mt-1 block w-32" inputMode="numeric" value={mounting.mileage} onChange={(e) => setMounting({ ...mounting, mileage: e.target.value })} />
                    </label>
                  )}
                  {off && (
                    <label className="text-sm">
                      <span className="text-xs text-muted">{t("vehicles.offGoesTo", { name: off.name || t(`vehicles.season.${off.season}` as TranslationKey) })}</span>
                      <input className="input mt-1 block w-44" value={mounting.storage} maxLength={120} placeholder={t("vehicles.storagePh")} onChange={(e) => setMounting({ ...mounting, storage: e.target.value })} />
                    </label>
                  )}
                  <button className="btn-primary">{t("vehicles.saveDone")}</button>
                  <button type="button" className="btn-ghost" onClick={() => setMounting(null)}>{t("common.cancel")}</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {form ? (
        <form
          className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = { name: form.name.trim(), season: form.season, size: form.size.trim(), bought: form.bought || null, tread_mm: num(form.tread_mm), storage: form.storage.trim() };
            run(async () => {
              if (form.id) await api.patch(`/api/vehicles/tyres/${form.id}`, body);
              else await api.post(`/api/vehicles/${vehicle.id}/tyres`, body);
              setForm(null);
            });
          }}
        >
          <input className="input" value={form.name} maxLength={120} placeholder={t("vehicles.tyreNamePh")} aria-label={t("vehicles.tyreName")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.season} aria-label={t("vehicles.tyreSeason")} onChange={(e) => setForm({ ...form, season: e.target.value as TyreForm["season"] })}>
            {SEASONS.map((s) => <option key={s} value={s}>{t(`vehicles.season.${s}` as TranslationKey)}</option>)}
          </select>
          <input className="input" value={form.size} maxLength={40} placeholder="205/55 R16" aria-label={t("vehicles.tyreSize")} onChange={(e) => setForm({ ...form, size: e.target.value })} />
          <label className="text-sm">
            <span className="text-xs text-muted">{t("vehicles.tyreBought")}</span>
            <input className="input mt-1 w-full" type="date" value={form.bought} onChange={(e) => setForm({ ...form, bought: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("vehicles.tyreTread")}</span>
            <input className="input mt-1 w-full" inputMode="decimal" value={form.tread_mm} onChange={(e) => setForm({ ...form, tread_mm: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("vehicles.tyreStorage")}</span>
            <input className="input mt-1 w-full" value={form.storage} maxLength={120} placeholder={t("vehicles.storagePh")} onChange={(e) => setForm({ ...form, storage: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary">{t("vehicles.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setForm({ id: "", name: "", season: rows.some((r) => r.season === "summer") ? "winter" : "summer", size: "", bought: "", tread_mm: "", storage: "" })}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("vehicles.addTyres")}
        </button>
      )}
      <p className="text-xs text-muted">{t("vehicles.tyresHelp")}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

const LOOKUPS = ["tyres", "oil", "service", "manual"] as const;

// Look the car up on the web (2.8.4): tyre pressure, oil, service intervals, the owner's manual.
function VehicleLookup({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useI18n();
  const canSearch = useWebSearch().enabled;
  const [topic, setTopic] = useState<(typeof LOOKUPS)[number] | null>(null);
  const what = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || vehicle.name;
  if (!canSearch) return null;
  return (
    <div className="rounded-lg border border-dashed border-edge p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("vehicles.lookup")}
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {LOOKUPS.map((k) => (
          <button key={k} type="button" className={`rounded-full border px-3 py-1 text-xs ${topic === k ? "border-accent bg-accent-soft font-semibold" : "border-edge hover:bg-base"}`} onClick={() => setTopic(k)}>
            {t(`vehicles.lookup.${k}` as TranslationKey)}
          </button>
        ))}
      </div>
      {topic && <WebSearch key={topic} initial={`${what} ${t(`vehicles.lookup.${topic}` as TranslationKey)}`} hint={t("vehicles.lookupHint")} onClose={() => setTopic(null)} />}
    </div>
  );
}

function DocumentsTab({ vehicle }: { vehicle: Vehicle }) {
  const { t, dateLocale } = useI18n();
  const linked = useApi<VehicleDocument[]>(`/api/vehicles/${vehicle.id}/documents`).data ?? NONE;
  const all = useApi<VehicleDocument[]>("/api/documents").data ?? NONE;
  const [pick, setPick] = useState("");
  const others = all.filter((d) => !linked.some((l) => l.id === d.id));
  return (
    <div className="space-y-3">
      <VehicleLookup vehicle={vehicle} />
      <p className="text-xs text-muted">{t("vehicles.documentsHelp")}</p>
      {linked.length === 0 ? (
        <EmptyState>{t("vehicles.documentsEmpty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-edge text-sm">
          {linked.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <FileText className="h-4 w-4 text-muted" aria-hidden />
              <Link href="/documents" className="flex-1 font-semibold hover:underline">{d.title}</Link>
              {d.expiry_date && <span className="text-xs text-muted">{t("vehicles.docExpires", { date: new Date(`${d.expiry_date}T12:00:00`).toLocaleDateString(dateLocale) })}</span>}
              <button className="text-xs text-muted hover:underline" onClick={() => api.del(`/api/vehicles/${vehicle.id}/documents/${d.id}`)}>
                {t("vehicles.unlink")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("vehicles.linkDocument")}>
            <option value="">{t("vehicles.linkDocument")}</option>
            {others.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button className="btn-ghost border border-edge" disabled={!pick} onClick={() => api.put<VehicleDocument[]>(`/api/vehicles/${vehicle.id}/documents/${pick}`, {}).then(() => setPick(""))}>
            {t("vehicles.link")}
          </button>
        </div>
      )}
      <Link href="/documents" className="text-sm text-accent hover:underline">{t("vehicles.toDocuments")}</Link>
    </div>
  );
}

function SettingsTab({ vehicle, onDeleted }: { vehicle: Vehicle; onDeleted: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const isAdmin = me.role === "admin";
  const [form, setForm] = useState({
    name: vehicle.name, kind: (vehicle.kind ?? "car") as VehicleKind, meter: (vehicle.meter ?? "km") as Meter, registration: vehicle.registration, make: vehicle.make ?? "",
    model: vehicle.model ?? "", year: vehicle.year?.toString() ?? "", fuel: vehicle.fuel ?? "", purchase_date: vehicle.purchase_date ?? "",
    purchase_price: vehicle.purchase_price?.toString() ?? "", charge_price_mode: vehicle.charge_price_mode ?? "spot", charge_fixed_price: vehicle.charge_fixed_price?.toString() ?? "",
    charge_extra: vehicle.charge_extra?.toString() ?? "", ha_meter_entity: vehicle.ha_meter_entity ?? "", notes: vehicle.notes ?? "",
  });
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const info = kindInfo(form.kind);
  const set = (patch: Partial<typeof form>) => {
    setSaved("");
    setForm({ ...form, ...patch });
  };
  const body = () => ({
    name: form.name.trim(), kind: form.kind, meter: form.meter, registration: form.registration.trim(), make: form.make.trim() || null, model: form.model.trim() || null,
    year: num(form.year), mileage: vehicle.mileage, fuel: form.fuel || null, purchase_date: form.purchase_date || null, purchase_price: num(form.purchase_price),
    charge_price_mode: form.charge_price_mode, charge_fixed_price: num(form.charge_fixed_price), charge_extra: num(form.charge_extra),
    ha_meter_entity: form.ha_meter_entity.trim() || null, notes: form.notes.trim() || null,
  });
  async function save() {
    setError("");
    try {
      await api.patch(`/api/vehicles/${vehicle.id}`, body());
      setSaved(t("vehicles.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.kind")}</span>
          <select className="input mt-1 w-full" value={form.kind} onChange={(e) => { const kind = e.target.value as VehicleKind; set({ kind, meter: kindInfo(kind).meter }); }}>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{kindInfo(k).icon} {t(kindLabel(k))}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.meter")}</span>
          <select className="input mt-1 w-full" value={form.meter} onChange={(e) => set({ meter: e.target.value as Meter })}>
            {(["km", "hours", "none"] as const).map((m) => <option key={m} value={m}>{t(`vehicles.meter.${m}` as TranslationKey)}</option>)}
          </select>
        </label>
        {(["name", "registration", "make", "model", "year"] as const).map((field) => (
          <label key={field} className="text-sm">
            <span className="text-xs text-muted">{t(`vehicles.field.${field}` as TranslationKey)}{field === "registration" && !info.registration ? ` (${t("vehicles.optional")})` : ""}</span>
            <input className="input mt-1 w-full" value={form[field]} inputMode={field === "year" ? "numeric" : undefined} required={field === "name"} onChange={(e) => set({ [field]: field === "registration" ? e.target.value.toUpperCase() : e.target.value })} />
          </label>
        ))}
        {(info.fuel || form.fuel) && (
          <label className="text-sm">
            <span className="text-xs text-muted">{t("vehicles.field.fuel")}</span>
            <select className="input mt-1 w-full" value={form.fuel} onChange={(e) => set({ fuel: e.target.value })}>
              <option value="">–</option>
              {FUELS.map((f) => <option key={f} value={f}>{t(`vehicles.fuel.${f}` as TranslationKey)}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.purchaseDate")}</span>
          <input className="input mt-1 w-full" type="date" value={form.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.purchasePrice")}</span>
          <input className="input mt-1 w-full" inputMode="decimal" value={form.purchase_price} onChange={(e) => set({ purchase_price: e.target.value })} />
        </label>
        {charges(form.fuel) && (
          <fieldset className="rounded-lg border border-edge p-3 sm:col-span-2">
            <legend className="px-1 text-xs font-semibold text-muted">{t("vehicles.homeCharging")}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="charge" checked={form.charge_price_mode === "spot"} onChange={() => set({ charge_price_mode: "spot" })} />
                {t("vehicles.chargeSpot")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="charge" checked={form.charge_price_mode === "fixed"} onChange={() => set({ charge_price_mode: "fixed" })} />
                {t("vehicles.chargeFixed")}
              </label>
            </div>
            {form.charge_price_mode === "spot" ? (
              <label className="mt-2 block text-sm">
                <span className="text-xs text-muted">{t("vehicles.chargeExtra")}</span>
                <input className="input mt-1 w-32" inputMode="decimal" value={form.charge_extra} placeholder="0,80" onChange={(e) => set({ charge_extra: e.target.value })} />
              </label>
            ) : (
              <label className="mt-2 block text-sm">
                <span className="text-xs text-muted">{t("vehicles.chargeFixedPrice")}</span>
                <input className="input mt-1 w-32" inputMode="decimal" value={form.charge_fixed_price} onChange={(e) => set({ charge_fixed_price: e.target.value })} />
              </label>
            )}
            <p className="mt-1 text-xs text-muted">{t("vehicles.chargeHelp")}</p>
          </fieldset>
        )}
        {me.smarthome_available && form.meter !== "none" && (
          <fieldset className="rounded-lg border border-edge p-3 sm:col-span-2">
            <legend className="px-1 text-xs font-semibold text-muted">{t("vehicles.haMeter")}</legend>
            <div className="flex flex-wrap items-end gap-2">
              <input className="input min-w-0 flex-1 font-mono text-sm" value={form.ha_meter_entity} placeholder="sensor.volvo_odometer" aria-label={t("vehicles.haMeter")} onChange={(e) => set({ ha_meter_entity: e.target.value })} />
              {vehicle.ha_meter_entity && (
                <button type="button" className="btn-ghost border border-edge" onClick={() => api.post(`/api/vehicles/${vehicle.id}/meter/read`, {}).then(() => setSaved(t("vehicles.meterRead"))).catch((e) => setError(e instanceof Error ? e.message : t("common.error")))}>
                  {t("vehicles.readNow")}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">{t("vehicles.haMeterHelp")}</p>
          </fieldset>
        )}
        <label className="text-sm sm:col-span-2">
          <span className="text-xs text-muted">{t("vehicles.field.notes")}</span>
          <textarea className="input mt-1 w-full" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="btn-primary">{t("vehicles.save")}</button>
          {saved && <span className="text-sm text-muted">{saved}</span>}
        </div>
        {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
      {isAdmin && <VehicleAccess vehicle={vehicle} />}
      <div className="flex flex-wrap gap-2">
        <Link className="btn-ghost inline-flex items-center gap-1 border border-edge" href={`/vehicle-report/${vehicle.id}`} target="_blank">
          <Printer className="h-4 w-4" aria-hidden />
          {t("vehicles.report")}
        </Link>
        <a className="btn-ghost inline-flex items-center gap-1 border border-edge" href={`/api/vehicles/export?vehicle_id=${vehicle.id}`}>
          <Download className="h-4 w-4" aria-hidden />
          {t("vehicles.exportZip")}
        </a>
        <button
          className="btn-ghost border border-red-300 text-red-700"
          onClick={() => {
            if (window.confirm(t("vehicles.deleteConfirm", { name: vehicle.name }))) api.del(`/api/vehicles/${vehicle.id}`).then(onDeleted);
          }}
        >
          {t("vehicles.delete")}
        </button>
      </div>
    </div>
  );
}

type Tab = "reminders" | "costs" | "meter" | "tyres" | "documents" | "settings";

export default function VehiclesPage() {
  const { t } = useI18n();
  const me = useMe();
  const [chosenId, setActiveId] = useState("");
  const [tab, setTab] = useState<Tab>("reminders");
  const [adding, setAdding] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ kind: "car" as VehicleKind, name: "", registration: "", fuel: "petrol" as VehicleFuel | "", mileage: "" });
  const [error, setError] = useState("");

  // From the cache: any change to a vehicle (here or elsewhere in the family) refreshes it.
  const overview = useApi<VehicleCard[]>("/api/vehicles/overview");
  const cards = overview.data ?? null;
  // The vehicle chosen – the first one until then, or when the chosen one is gone.
  const activeId = cards?.some((c) => c.vehicle.id === chosenId) ? chosenId : (cards?.[0]?.vehicle.id ?? "");
  const expenses = useApi<VehicleExpense[]>(activeId ? `/api/vehicles/expenses?vehicle_id=${activeId}` : null).data ?? NONE;
  useEffect(() => {
    if (overview.error) setError(overview.error.message);
  }, [overview.error]);

  const active = cards?.find((c) => c.vehicle.id === activeId) ?? null;
  const newInfo = kindInfo(newVehicle.kind);

  async function create() {
    setError("");
    try {
      const row = await api.post<Vehicle>("/api/vehicles", {
        name: newVehicle.name.trim(), kind: newVehicle.kind, meter: newInfo.meter, registration: newVehicle.registration.trim(),
        fuel: newInfo.fuel ? newVehicle.fuel || null : null, mileage: newInfo.meter !== "none" ? num(newVehicle.mileage) : null, make: null, model: null, year: null, notes: null,
      });
      setNewVehicle({ kind: "car", name: "", registration: "", fuel: "petrol", mileage: "" });
      setAdding(false);
      setActiveId(row.id);
      setTab("reminders");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const info = kindInfo(active?.vehicle.kind);
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "reminders", label: t("vehicles.tab.reminders"), show: true },
    { id: "costs", label: t("vehicles.tab.costs"), show: true },
    { id: "meter", label: active?.vehicle.meter === "hours" ? t("vehicles.tab.hours") : t("vehicles.tab.odometer"), show: active?.vehicle.meter !== "none" },
    { id: "tyres", label: t("vehicles.tab.tyres"), show: info.tyres },
    { id: "documents", label: t("vehicles.tab.documents"), show: me.apps.includes("documents") },
    { id: "settings", label: t("vehicles.tab.settings"), show: true },
  ];
  const shown = tabs.filter((x) => x.show);
  const current = shown.some((x) => x.id === tab) ? tab : "reminders";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <PageTitle title={t("vehicles.title")} />
        <button className="btn-primary inline-flex items-center gap-1" onClick={() => setAdding((a) => !a)}>
          {adding ? t("common.cancel") : <><Plus className="h-4 w-4" aria-hidden />{t("vehicles.addVehicle")}</>}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{t("vehicles.intro")}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {adding && (
        <form
          className="card mt-4 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <select className="input" value={newVehicle.kind} aria-label={t("vehicles.field.kind")} onChange={(e) => setNewVehicle({ ...newVehicle, kind: e.target.value as VehicleKind })}>
            {KIND_ORDER.map((k) => <option key={k} value={k}>{kindInfo(k).icon} {t(kindLabel(k))}</option>)}
          </select>
          <input className="input" value={newVehicle.name} required maxLength={120} placeholder={t("vehicles.vehicleNamePh")} aria-label={t("vehicles.field.name")} onChange={(e) => setNewVehicle({ ...newVehicle, name: e.target.value })} />
          {newInfo.registration && (
            <input className="input" value={newVehicle.registration} maxLength={40} placeholder={t("vehicles.registrationPh")} aria-label={t("vehicles.field.registration")} onChange={(e) => setNewVehicle({ ...newVehicle, registration: e.target.value.toUpperCase() })} />
          )}
          {newInfo.fuel && (
            <select className="input" value={newVehicle.fuel} aria-label={t("vehicles.field.fuel")} onChange={(e) => setNewVehicle({ ...newVehicle, fuel: e.target.value as VehicleFuel })}>
              {FUELS.map((f) => <option key={f} value={f}>{t(`vehicles.fuel.${f}` as TranslationKey)}</option>)}
            </select>
          )}
          {newInfo.meter !== "none" && (
            <input className="input" inputMode="numeric" value={newVehicle.mileage} placeholder={meterLabel(t, newInfo.meter)} aria-label={meterLabel(t, newInfo.meter)} onChange={(e) => setNewVehicle({ ...newVehicle, mileage: e.target.value })} />
          )}
          <button className="btn-primary" disabled={!newVehicle.name.trim()}>{t("vehicles.addVehicle")}</button>
        </form>
      )}

      {cards && cards.length === 0 && !adding && (
        <div className="mt-4">
          <EmptyState action={<button className="btn-primary" onClick={() => setAdding(true)}>{t("vehicles.addVehicle")}</button>}>{t("vehicles.empty")}</EmptyState>
        </div>
      )}

      {cards && cards.length > 0 && (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {cards.map((card) => (
            <OverviewCard key={card.vehicle.id} card={card} active={card.vehicle.id === activeId} onOpen={() => setActiveId(card.vehicle.id)} />
          ))}
        </ul>
      )}

      {active && (
        <section className="card mt-5 p-4" aria-label={active.vehicle.name}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Gauge className="h-5 w-5 text-accent" aria-hidden />
            {active.vehicle.name}
          </h2>
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-edge p-1" role="tablist">
            {shown.map((x) => (
              <button key={x.id} role="tab" aria-selected={current === x.id} className={`rounded px-3 py-1.5 text-sm ${current === x.id ? "bg-base font-semibold" : "text-muted"}`} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          {current === "reminders" && <RemindersTab vehicle={active.vehicle} reminders={active.reminders} currency={active.currency} />}
          {current === "costs" && <CostsTab vehicle={active.vehicle} expenses={expenses} currency={active.currency} />}
          {current === "meter" && <MeterTab vehicle={active.vehicle} currency={active.currency} />}
          {current === "tyres" && <TyresTab vehicle={active.vehicle} />}
          {current === "documents" && <DocumentsTab vehicle={active.vehicle} />}
          {current === "settings" && <SettingsTab key={active.vehicle.id} vehicle={active.vehicle} onDeleted={() => setActiveId("")} />}
        </section>
      )}
    </>
  );
}
