"use client";

// The member's AI jobs: what waits for the AI computer, and what it came up with – to look at,
// change and use, or put away. Nothing is saved until the member says so.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Clock, Trash2, TriangleAlert } from "lucide-react";
import { api, FamilyList, Property, Vehicle } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useLive } from "@/lib/live";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import { AiJob, AiNote, useAiStatus } from "@/components/LocalAi";
import { useWebSearch } from "@/components/WebSearch";

type ReceiptRow = { keep: boolean; name: string; amount: string; unit: string; place: string; best_before: string };
type Ingredient = { name: string; amount: number | null; unit: string | null };

const isoIn = (days: number | null | undefined) => {
  if (days === null || days === undefined) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function ReceiptReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const items = ((job.result?.items as { name: string; amount: number | null; unit?: string; place: string; keeps_days?: number | null; food?: boolean }[]) ?? []);
  const [rows, setRows] = useState<ReceiptRow[]>(
    items.map((i) => ({ keep: i.food !== false, name: i.name, amount: i.amount !== null && i.amount !== undefined ? String(i.amount) : "", unit: i.unit ?? "", place: i.place, best_before: isoIn(i.keeps_days) }))
  );
  const set = (n: number, patch: Partial<ReceiptRow>) => setRows(rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  async function apply() {
    await api.post(`/api/ai/jobs/${job.id}/apply/receipt`, {
      items: rows.filter((r) => r.keep && r.name.trim()).map((r) => ({ name: r.name.trim(), amount: r.amount ? Number(r.amount.replace(",", ".")) : null, unit: r.unit, place: r.place, best_before: r.best_before || null })),
    });
    onDone();
  }
  return (
    <div className="space-y-2">
      {job.input.store && <p className="text-xs text-muted">{job.input.store}</p>}
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className={`flex flex-wrap items-center gap-2 text-sm ${r.keep ? "" : "opacity-50"}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} aria-label={t("ai.keep", { name: r.name })} />
            <input className="input min-w-32 flex-1 py-1" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t("pantry.name")} />
            <input className="input w-16 py-1" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={t("pantry.amount")} />
            <input className="input w-14 py-1" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label={t("pantry.unit")} />
            <select className="input w-auto py-1" value={r.place} onChange={(e) => set(i, { place: e.target.value })} aria-label={t("pantry.where")}>
              {(["fridge", "freezer", "pantry"] as const).map((p) => <option key={p} value={p}>{t(`pantry.place.${p}`)}</option>)}
            </select>
            <input className="input w-36 py-1" type="date" value={r.best_before} onChange={(e) => set(i, { best_before: e.target.value })} aria-label={t("pantry.bestBefore")} />
          </li>
        ))}
      </ul>
      <button className="btn-primary" onClick={apply} disabled={!rows.some((r) => r.keep)}>{t("ai.toPantry", { n: rows.filter((r) => r.keep).length })}</button>
    </div>
  );
}

const VEHICLE_CATEGORIES = ["fuel", "charging", "service", "repair", "tyres", "insurance", "tax", "parking", "toll", "other"] as const;

type VehicleRow = { keep: boolean; name: string; amount: string; expense_date: string; category: string; mileage_at: string; volume: string; volume_unit: "l" | "kWh" | null };

/** A receipt or service history for a vehicle: look over the costs, then into Vehicles. */
function VehicleReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(String(job.input.vehicle_id ?? ""));
  const found = (job.result?.expenses as { name: string; amount: number; expense_date: string | null; category: string; mileage_at: number | null; volume: number | null; volume_unit: "l" | "kWh" | null }[]) ?? [];
  const [rows, setRows] = useState<VehicleRow[]>(
    found.map((e) => ({
      keep: true, name: e.name, amount: String(e.amount ?? ""), expense_date: e.expense_date || new Date().toISOString().slice(0, 10),
      category: (VEHICLE_CATEGORIES as readonly string[]).includes(e.category) ? e.category : "other",
      mileage_at: e.mileage_at?.toString() ?? "", volume: e.volume?.toString() ?? "", volume_unit: e.volume_unit,
    }))
  );
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Vehicle[]>("/api/vehicles").then(setVehicles).catch(() => setVehicles([]));
  }, []);
  const set = (n: number, patch: Partial<VehicleRow>) => setRows(rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const n = (v: string) => (v.trim() ? Number(v.replace(",", ".").replace(/\s/g, "")) : null);
  async function apply() {
    setError("");
    try {
      await api.post(`/api/ai/jobs/${job.id}/apply/vehicle`, {
        vehicle_id: vehicleId,
        expenses: rows
          .filter((r) => r.keep && r.name.trim() && n(r.amount))
          .map((r) => {
            const filling = r.category === "fuel" || r.category === "charging";
            const volume = filling ? n(r.volume) : null;
            return {
              vehicle_id: vehicleId, name: r.name.trim(), amount: n(r.amount), expense_date: r.expense_date, category: r.category, mileage_at: n(r.mileage_at),
              volume, volume_unit: volume ? r.volume_unit ?? (r.category === "charging" ? "kWh" : "l") : null,
            };
          }),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  return (
    <div className="space-y-2">
      {job.input.store && <p className="text-xs text-muted">{job.input.store}</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className={`flex flex-wrap items-center gap-2 text-sm ${r.keep ? "" : "opacity-50"}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} aria-label={t("ai.keep", { name: r.name })} />
            <input className="input min-w-32 flex-1 py-1" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t("vehicles.expenseNamePh")} />
            <input className="input w-24 py-1" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={t("vehicles.amountPh")} />
            <input className="input w-36 py-1" type="date" value={r.expense_date} onChange={(e) => set(i, { expense_date: e.target.value })} aria-label={t("vehicles.date")} />
            <select className="input w-auto py-1" value={r.category} onChange={(e) => set(i, { category: e.target.value })} aria-label={t("vehicles.category")}>
              {VEHICLE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`vehicles.cat.${c}` as TranslationKey)}</option>)}
            </select>
            <input className="input w-28 py-1" inputMode="numeric" value={r.mileage_at} placeholder={t("vehicles.odometerKm")} onChange={(e) => set(i, { mileage_at: e.target.value })} aria-label={t("vehicles.odometerKm")} />
            {(r.category === "fuel" || r.category === "charging") && (
              <input className="input w-20 py-1" inputMode="decimal" value={r.volume} placeholder={r.category === "charging" ? "kWh" : "l"} onChange={(e) => set(i, { volume: e.target.value })} aria-label={t(r.category === "charging" ? "vehicles.kwh" : "vehicles.litres")} />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-muted">{t("ai.goesTo")}</span>
          <select className="input w-auto" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-label={t("vehicles.title")}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <button className="btn-primary" onClick={apply} disabled={!vehicleId || !rows.some((r) => r.keep)}>{t("ai.toVehicle", { n: rows.filter((r) => r.keep).length })}</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

const PROPERTY_CATEGORIES = ["maintenance", "renovation", "repair", "tax", "insurance", "utility", "loan", "other"] as const;

type PropertyRow = { keep: boolean; name: string; amount: string; expense_date: string; category: string };

/** A receipt or invoice for a home: look over the costs, then into Property. */
function PropertyReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const [homes, setHomes] = useState<Property[]>([]);
  const [homeId, setHomeId] = useState(String(job.input.property_id ?? ""));
  const found = (job.result?.expenses as { name: string; amount: number; expense_date: string | null; category: string }[]) ?? [];
  const [rows, setRows] = useState<PropertyRow[]>(
    found.map((e) => ({
      keep: true, name: e.name, amount: String(e.amount ?? ""), expense_date: e.expense_date || new Date().toISOString().slice(0, 10),
      category: (PROPERTY_CATEGORIES as readonly string[]).includes(e.category) ? e.category : "other",
    }))
  );
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Property[]>("/api/property/properties").then(setHomes).catch(() => setHomes([]));
  }, []);
  const set = (n: number, patch: Partial<PropertyRow>) => setRows(rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  async function apply() {
    setError("");
    try {
      await api.post(`/api/ai/jobs/${job.id}/apply/property`, {
        property_id: homeId,
        expenses: rows
          .filter((r) => r.keep && r.name.trim() && Number(r.amount.replace(",", ".")))
          .map((r) => ({ property_id: homeId, name: r.name.trim(), amount: Number(r.amount.replace(",", ".").replace(/\s/g, "")), expense_date: r.expense_date, category: r.category })),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className={`flex flex-wrap items-center gap-2 text-sm ${r.keep ? "" : "opacity-50"}`}>
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} aria-label={t("ai.keep", { name: r.name })} />
            <input className="input min-w-32 flex-1 py-1" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label={t("property.expenseNamePh")} />
            <input className="input w-24 py-1" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={t("property.amountPh")} />
            <input className="input w-36 py-1" type="date" value={r.expense_date} onChange={(e) => set(i, { expense_date: e.target.value })} aria-label={t("property.date")} />
            <select className="input w-auto py-1" value={r.category} onChange={(e) => set(i, { category: e.target.value })} aria-label={t("property.category")}>
              {PROPERTY_CATEGORIES.map((c) => <option key={c} value={c}>{t(`property.cat.${c}` as TranslationKey)}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-muted">{t("ai.goesTo")}</span>
          <select className="input w-auto" value={homeId} onChange={(e) => setHomeId(e.target.value)} aria-label={t("property.title")}>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button className="btn-primary" onClick={apply} disabled={!homeId || !rows.some((r) => r.keep)}>{t("ai.toProperty", { n: rows.filter((r) => r.keep).length })}</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** The week's dinners: choose the days to keep; they become the week's plan in Food. */
function MealPlanReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t, dateLocale } = useI18n();
  const meals = ((job.result?.meals as { weekday: number; name: string; description?: string | null }[]) ?? []).slice().sort((a, b) => a.weekday - b.weekday);
  const [keep, setKeep] = useState<number[]>(meals.map((m) => m.weekday));
  const [error, setError] = useState("");
  const weekday = (d: number) => new Date(2024, 0, 1 + d).toLocaleDateString(dateLocale, { weekday: "long" });
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {meals.map((m) => (
          <li key={m.weekday} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={keep.includes(m.weekday)} onChange={(e) => setKeep(e.target.checked ? [...keep, m.weekday] : keep.filter((d) => d !== m.weekday))} aria-label={t("ai.keep", { name: m.name })} />
            <span>
              <span className="capitalize text-muted">{weekday(m.weekday)}</span> · <span className="font-semibold">{m.name}</span>
              {m.description && <span className="block text-xs text-muted">{m.description}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">{t("ai.mealPlanReplaces")}</p>
      <button
        className="btn-primary"
        disabled={keep.length === 0}
        onClick={() => api.post(`/api/ai/jobs/${job.id}/apply/meal_plan`, { weekdays: keep }).then(onDone).catch((e) => setError(e instanceof Error ? e.message : t("common.error")))}
      >
        {t("ai.toMealPlan", { n: keep.length })}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Suggested chores: choose the ones to make into tasks. */
function ChoresReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const chores = (job.result?.chores as { title: string; points: number; recurrence: string; assignee?: string | null }[]) ?? [];
  const [keep, setKeep] = useState<number[]>(chores.map((_, i) => i));
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {chores.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={keep.includes(i)} onChange={(e) => setKeep(e.target.checked ? [...keep, i] : keep.filter((x) => x !== i))} aria-label={t("ai.keep", { name: c.title })} />
            <span className="font-semibold">{c.title}</span>
            <span className="text-xs text-muted">{[t(`ai.recurrence.${c.recurrence}` as TranslationKey), `${c.points} p`, c.assignee].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
      <button
        className="btn-primary"
        disabled={keep.length === 0}
        onClick={() => api.post(`/api/ai/jobs/${job.id}/apply/chores`, { keep }).then(onDone).catch((e) => setError(e instanceof Error ? e.message : t("common.error")))}
      >
        {t("ai.toTasks", { n: keep.length })}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function RecipeReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const r = job.result as { name?: string; servings?: number; ingredients?: Ingredient[]; steps?: string[] } | null;
  const [name, setName] = useState(r?.name ?? "");
  const [servings, setServings] = useState(r?.servings || 4);
  const [ingredients, setIngredients] = useState((r?.ingredients ?? []).map((i) => [i.amount ?? "", i.unit ?? "", i.name].filter((x) => x !== "").join(" ")).join("\n"));
  const [steps, setSteps] = useState((r?.steps ?? []).join("\n"));
  async function apply() {
    // Each line: "2,5 dl vetemjöl" → amount, unit, name.
    const parsed = ingredients.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.+)$/);
      return m ? { amount: Number(m[1].replace(",", ".")), unit: m[2], name: m[3] } : { amount: null, unit: null, name: line };
    });
    await api.post(`/api/ai/jobs/${job.id}/apply/recipe`, { name: name.trim(), servings, ingredients: parsed, steps: steps.split("\n").map((s) => s.trim()).filter(Boolean) });
    onDone();
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label={t("ai.recipeName")} />
      <input className="input w-24" type="number" min={1} max={20} value={servings} onChange={(e) => setServings(Number(e.target.value) || 4)} aria-label={t("ai.servings")} />
      <textarea className="input min-h-32" value={ingredients} onChange={(e) => setIngredients(e.target.value)} aria-label={t("food.pasteIngredientsPh")} />
      <textarea className="input min-h-32" value={steps} onChange={(e) => setSteps(e.target.value)} aria-label={t("food.pasteStepsPh")} />
      <button className="btn-primary sm:col-span-2 justify-self-start" onClick={apply} disabled={!name.trim()}>{t("food.saveRecipe")}</button>
    </div>
  );
}

const NEW_LIST = "new";

function ListReview({ job, lists, onDone }: { job: AiJob; lists: FamilyList[]; onDone: () => void }) {
  const { t } = useI18n();
  const items = (job.result?.items as { name: string; category: string }[]) ?? [];
  const [rows, setRows] = useState(items.map((i) => ({ ...i, keep: true })));
  // The list it was asked from, else the first one – the lists may arrive after the job.
  const [picked, setPicked] = useState("");
  const [newName, setNewName] = useState(() => t("ai.newListName"));
  const listId = [picked, job.input.list_id, lists[0]?.id].find((id) => id && lists.some((l) => l.id === id)) ?? "";
  // A new list: chosen in the menu, or because there is none yet.
  const makeNew = picked === NEW_LIST || lists.length === 0;
  async function apply() {
    const target = makeNew ? (await api.post<FamilyList>("/api/lists", { name: newName.trim() || t("ai.newListName") })).id : listId;
    await api.post(`/api/ai/jobs/${job.id}/apply/list`, { list_id: target, items: rows.filter((r) => r.keep && r.name.trim()).map(({ name, category }) => ({ name: name.trim(), category })) });
    onDone();
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={r.keep} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label={t("ai.keep", { name: r.name })} />
            <input className="input flex-1 py-1" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={t("pantry.name")} />
            <span className="text-xs text-muted">{t(`lists.category.${r.category}` as TranslationKey)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-muted">{t("ai.goesTo")}</span>
          {lists.length > 0 && (
            <select className="input w-auto" value={makeNew ? NEW_LIST : listId} onChange={(e) => setPicked(e.target.value)} aria-label={t("ai.whichList")}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              <option value={NEW_LIST}>{t("ai.newList")}</option>
            </select>
          )}
        </label>
        {makeNew && (
          <input className="input w-48" value={newName} maxLength={160} onChange={(e) => setNewName(e.target.value)} aria-label={t("ai.newListLabel")} placeholder={t("ai.newListName")} />
        )}
        <button className="btn-primary" onClick={apply} disabled={!rows.some((r) => r.keep && r.name.trim())}>{t("ai.toList")}</button>
      </div>
    </div>
  );
}

type Source = { title: string; url: string; site: string };

// A complaint written from a receipt (2.8.4): to copy into a mail to the shop, with the receipt.
function ComplaintView({ job }: { job: AiJob }) {
  const { t } = useI18n();
  const subject = String(job.result?.subject ?? "");
  const body = String(job.result?.body ?? "");
  const [copied, setCopied] = useState(false);
  return (
    <div className="text-sm">
      <p className="font-semibold">{subject}</p>
      <p className="mt-2 whitespace-pre-wrap rounded bg-base p-3">{body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => setCopied(true)).catch(() => {})}>{copied ? t("homes.copied") : t("receipts.copyComplaint")}</button>
        <a className="btn-ghost border border-edge" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>{t("receipts.mailComplaint")}</a>
      </div>
      <p className="mt-2 text-xs text-muted">{t("receipts.attachReceipt")}</p>
    </div>
  );
}

// A receipt kept in the vault, read by the AI (2.8.4): store, total, date and category to use.
function ReceiptInfoReview({ job, onDone }: { job: AiJob; onDone: () => void }) {
  const { t } = useI18n();
  const r = (job.result ?? {}) as { store?: string | null; total?: number | null; purchased_on?: string | null; category?: string };
  const lines = ((job.input as { lines?: string[] }).lines ?? []).join("\n");
  const receiptId = (job.input as { receipt_id?: string }).receipt_id;
  const [error, setError] = useState("");
  const valid = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

  async function apply() {
    setError("");
    try {
      await api.patch(`/api/receipts/${receiptId}`, {
        ...(r.store ? { store: r.store } : {}),
        ...(typeof r.total === "number" ? { amount: r.total } : {}),
        ...(valid(r.purchased_on) ? { purchased_on: r.purchased_on } : {}),
        ...(r.category ? { category: r.category } : {}),
        ...(lines ? { text: lines } : {}),
      });
      await api.del(`/api/ai/jobs/${job.id}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">{t("receipts.store")}</dt>
        <dd>{r.store || "–"}</dd>
        <dt className="text-muted">{t("receipts.amount")}</dt>
        <dd>{typeof r.total === "number" ? r.total : "–"}</dd>
        <dt className="text-muted">{t("receipts.date")}</dt>
        <dd>{valid(r.purchased_on) ? r.purchased_on : "–"}</dd>
        <dt className="text-muted">{t("receipts.category")}</dt>
        <dd>{r.category ? t(`receipts.cat.${r.category}` as TranslationKey) : "–"}</dd>
      </dl>
      <button className="btn-primary mt-3" onClick={apply}>{t("receipts.aiUse")}</button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// A question answered from the web (2.8.4): the answer with its numbered sources.
function WebAnswer({ job }: { job: AiJob }) {
  const { t } = useI18n();
  const sources = ((job.input as { sources?: Source[] }).sources ?? []);
  const used = new Set((job.result?.sources as number[] | undefined) ?? []);
  const shown = sources.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => used.size === 0 || used.has(s.n));
  return (
    <div className="text-sm">
      <p className="whitespace-pre-wrap">{String(job.result?.answer ?? "")}</p>
      {shown.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("ai.sources")}</p>
          <ol className="mt-1 space-y-0.5 text-xs">
            {shown.map((s) => (
              <li key={s.n}>
                [{s.n}]{" "}
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  {s.title}
                </a>{" "}
                <span className="text-muted">· {s.site}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-2 text-xs text-muted">{t("ai.webCheck")}</p>
    </div>
  );
}

function AskWeb({ onAsked }: { onAsked: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask() {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/ai/jobs", { kind: "web_question", text: question.trim() });
      setQuestion("");
      onAsked();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4 p-4" aria-label={t("ai.webAsk")}>
      <h2 className="text-sm font-semibold">{t("ai.webAsk")}</h2>
      <p className="mt-1 text-xs text-muted">{t("ai.webAskHint")}</p>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input className="input min-w-56 flex-1" value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} placeholder={t("ai.webAskPh")} aria-label={t("ai.webAsk")} />
        <button className="btn-primary" disabled={busy || question.trim().length < 3}>
          {busy ? t("common.loading") : t("ai.webAskSend")}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function IdeasView({ job }: { job: AiJob }) {
  const { t } = useI18n();
  const ideas = (job.result?.ideas as { title: string; uses: string[]; recipe: string | null; why: string }[]) ?? [];
  return (
    <ul className="space-y-2">
      {ideas.map((idea, i) => (
        <li key={i} className="text-sm">
          <p className="font-semibold">{idea.title}</p>
          <p className="text-xs text-muted">{idea.uses.join(", ")} · {idea.why}</p>
          <Link href={`/recipes?search=${encodeURIComponent(idea.title)}#recipe-search`} className="text-xs text-accent hover:underline">
            {t("ai.findRealRecipes")}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AiJobsPage() {
  const { t, dateLocale } = useI18n();
  const status = useAiStatus();
  const webSearch = useWebSearch();
  const [jobs, setJobs] = useState<AiJob[] | null>(null);
  const [lists, setLists] = useState<FamilyList[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<AiJob[]>("/api/ai/jobs").then(setJobs).catch(() => setJobs([]));
    // Again each time: a list made for one job is there for the next.
    api.live<FamilyList[]>("/api/lists", setLists).catch(() => {});
  }, []);
  useEffect(load, [load]);
  // A job finishing sends a notification; refresh then too.
  useLive(["ai", "notifications", "lists"], load);
  useEffect(() => {
    setFocus(new URLSearchParams(window.location.search).get("job"));
  }, []);

  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const open = (jobs ?? []).filter((j) => ["queued", "running", "done", "failed"].includes(j.status));
  const past = (jobs ?? []).filter((j) => !open.includes(j));

  return (
    <>
      <PageTitle title={t("ai.title")} icon={Bot} />
      {status && (status.available ? <div className="mt-1"><AiNote status={status} /></div> : <p className="mt-1 text-sm text-muted">{t("ai.unavailable")}</p>)}
      {status?.available && webSearch.enabled && <AskWeb onAsked={load} />}

      <div className="mt-4 space-y-3">
        {jobs === null ? (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        ) : open.length === 0 ? (
          <EmptyState>{t("ai.empty")}</EmptyState>
        ) : (
          open.map((job) => (
            <section key={job.id} className={`card p-4 ${focus === job.id ? "ring-2 ring-accent" : ""}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`ai.kind.${job.kind}` as TranslationKey)}</span>
                <span className="text-xs text-muted">{when(job.created_at)}</span>
                {job.status === "queued" && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {job.position && job.position > 1 ? t("ai.queuedPosition", { n: job.position }) : t("ai.queued")}
                  </span>
                )}
                {job.status === "running" && <span className="text-xs font-semibold text-accent">{t("ai.running")}</span>}
                <button className="ml-auto text-muted hover:text-red-700" onClick={() => api.del(`/api/ai/jobs/${job.id}`).then(load)} aria-label={job.status === "queued" ? t("ai.cancel") : t("ai.dismiss")} title={job.status === "queued" ? t("ai.cancel") : t("ai.dismiss")}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              {job.input.text && <p className="mb-2 line-clamp-2 text-xs text-muted">{job.input.text}</p>}
              {job.status === "done" && job.kind === "receipt" && <ReceiptReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "recipe" && <RecipeReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "quick_add" && <ListReview job={job} lists={lists} onDone={load} />}
              {job.status === "done" && job.kind === "cook_ideas" && <IdeasView job={job} />}
              {job.status === "done" && job.kind === "web_question" && <WebAnswer job={job} />}
              {job.status === "done" && job.kind === "receipt_info" && <ReceiptInfoReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "complaint_letter" && <ComplaintView job={job} />}
              {job.status === "done" && job.kind === "vehicle_receipt" && <VehicleReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "property_receipt" && <PropertyReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "meal_plan" && <MealPlanReview job={job} onDone={load} />}
              {job.status === "done" && job.kind === "chores" && <ChoresReview job={job} onDone={load} />}
              {job.status === "failed" && (
                <p className="flex items-start gap-1.5 text-sm text-red-700">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {t("ai.failed")} <Link className="underline" href={job.kind === "recipe" ? "/food" : job.kind === "quick_add" ? "/lists" : job.kind === "vehicle_receipt" ? "/vehicles" : job.kind === "property_receipt" ? "/property" : job.kind === "meal_plan" ? "/food" : job.kind === "chores" ? "/settings/home" : job.kind === "web_question" ? "/ai" : job.kind === "receipt_info" || job.kind === "complaint_letter" ? "/vault?view=receipt" : "/pantry"}>{t("ai.byHand")}</Link>
                    {job.error && <span className="block text-xs text-muted">{job.error}</span>}
                  </span>
                </p>
              )}
            </section>
          ))
        )}
      </div>

      {past.length > 0 && (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-muted">{t("ai.history", { n: past.length })}</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {past.map((j) => <li key={j.id}>{when(j.created_at)} · {t(`ai.kind.${j.kind}` as TranslationKey)} · {t(`ai.status.${j.status}` as TranslationKey)}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}
