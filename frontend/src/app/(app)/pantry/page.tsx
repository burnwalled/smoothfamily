"use client";

// Pantry: what the family has in the freezer, fridge and pantry, with best-before dates. The ones to
// use first are marked; something used up can go straight back onto a shopping list.
import { useCallback, useEffect, useState } from "react";
import { Barcode, CalendarClock, Trash2 } from "lucide-react";
import { api, FamilyList, PantryItem, PantryPlace } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import JustBought from "@/components/pantry/JustBought";
import { AiTextButton, ReceiptButton } from "@/components/LocalAi";
import ScanSession, { ScanBackend } from "@/components/BarcodeScan";

const scanBackend: ScanBackend = {
  lookup: (code) => api.get(`/api/pantry/barcode/${encodeURIComponent(code)}`),
  save: (body) => api.post("/api/pantry/scan", body),
  remove: (id) => api.del(`/api/pantry/${id}`),
};

const PLACES: PantryPlace[] = ["freezer", "fridge", "pantry"];

export default function PantryPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [lists, setLists] = useState<FamilyList[]>([]);
  const [tab, setTab] = useState<PantryPlace | "all">("all");
  const [form, setForm] = useState({ name: "", amount: "", unit: "", place: "fridge" as PantryPlace, best_before: "" });
  const [toList, setToList] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    api.live<PantryItem[]>("/api/pantry", setItems).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);
  useEffect(load, [load]);
  useLive(["pantry"], load);
  useEffect(() => {
    if (!me.apps?.includes("lists")) return;
    api
      .live<FamilyList[]>("/api/lists", (rows) => {
        setLists(rows);
        setToList((current) => current || rows[0]?.id || "");
      })
      .catch(() => {});
  }, [me.apps]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function add() {
    if (!form.name.trim()) return;
    const amount = form.amount.trim() ? Number(form.amount.replace(",", ".")) : null;
    return run(async () => {
      await api.post("/api/pantry", { name: form.name.trim(), place: form.place, unit: form.unit.trim(), amount: Number.isFinite(amount) ? amount : null, best_before: form.best_before || null });
      // Keep the place and unit: several things usually go into the same place.
      setForm({ ...form, name: "", amount: "", best_before: "" });
    });
  }

  const placeLabel = (p: PantryPlace) => t(`pantry.place.${p}` as TranslationKey);
  const shown = (items ?? []).filter((i) => tab === "all" || i.place === tab);
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

  return (
    <>
      <PageTitle title={t("pantry.title")} />
      <p className="mt-1 text-sm text-muted">{t("pantry.intro")}</p>
      <JustBought onAdded={load} />
      <div className="mt-3 flex flex-wrap gap-4">
        <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setScanning(true)}>
          <Barcode className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("scan.open")}
        </button>
        <ReceiptButton />
        <AiTextButton kind="cook_ideas" label={t("ai.cookIdeas")} />
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {scanning && <ScanSession backend={scanBackend} onClose={() => setScanning(false)} onSaved={load} />}

      <form
        className="card mt-4 grid gap-2 p-4 sm:grid-cols-[1fr_5rem_5rem_8rem_9rem_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("pantry.namePh")} aria-label={t("pantry.name")} />
        <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={t("pantry.amount")} aria-label={t("pantry.amount")} />
        <input className="input" value={form.unit} maxLength={20} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t("pantry.unitPh")} aria-label={t("pantry.unit")} />
        <select className="input" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value as PantryPlace })} aria-label={t("pantry.where")}>
          {PLACES.map((p) => <option key={p} value={p}>{placeLabel(p)}</option>)}
        </select>
        <input className="input" type="date" value={form.best_before} onChange={(e) => setForm({ ...form, best_before: e.target.value })} aria-label={t("pantry.bestBefore")} title={t("pantry.bestBefore")} />
        <button className="btn-primary" disabled={!form.name.trim()}>{t("common.add")}</button>
      </form>

      <div className="mt-4 inline-flex rounded-lg border border-edge bg-surface p-1" role="tablist">
        {(["all", ...PLACES] as const).map((key) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`rounded px-3 py-1 text-sm ${tab === key ? "bg-base font-semibold" : "text-muted"}`} onClick={() => setTab(key)}>
            {key === "all" ? t("pantry.all") : placeLabel(key)}
            {items && <span className="ml-1 text-xs text-muted">{key === "all" ? items.length : items.filter((i) => i.place === key).length}</span>}
          </button>
        ))}
      </div>

      {lists.length > 1 && (
        <label className="ml-3 inline-flex items-center gap-2 text-xs text-muted">
          {t("pantry.backTo")}
          <select className="input w-auto py-1 text-xs" value={toList} onChange={(e) => setToList(e.target.value)}>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}

      <div className="mt-3">
        {items === null ? (
          <p className="text-sm text-muted">{t("common.loading")}</p>
        ) : shown.length === 0 ? (
          <EmptyState>{t("pantry.empty")}</EmptyState>
        ) : (
          <ul className="card divide-y divide-edge">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-semibold">{item.name}</span>
                {(item.amount !== null || item.unit) && (
                  <span className="text-muted">{[item.amount !== null ? item.amount.toLocaleString(dateLocale) : "", item.unit].filter(Boolean).join(" ")}</span>
                )}
                {tab === "all" && <span className="text-xs text-muted">{placeLabel(item.place)}</span>}
                {item.best_before && (
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      item.status === "expired" ? "bg-red-100 font-semibold text-red-800" : item.status === "soon" ? "bg-amber-100 font-semibold text-amber-900" : "text-muted"
                    }`}
                  >
                    <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {item.status === "expired" ? t("pantry.expired", { date: day(item.best_before) }) : t("pantry.bestBeforeOn", { date: day(item.best_before) })}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => api.post(`/api/pantry/${item.id}/finished`, {}))}>
                    {t("pantry.finished")}
                  </button>
                  {toList && (
                    <button className="btn-ghost border border-edge px-2 py-1 text-xs" onClick={() => run(() => api.post(`/api/pantry/${item.id}/finished`, { to_list: toList }))}>
                      {t("pantry.finishedToList")}
                    </button>
                  )}
                  <button className="btn-ghost px-2 py-1 text-red-700" onClick={() => run(() => api.del(`/api/pantry/${item.id}`))} aria-label={t("pantry.remove", { name: item.name })}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
