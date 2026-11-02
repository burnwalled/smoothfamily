"use client";

// The vault's receipts (2.8.4): add a receipt, link it to what it was for (a home, a vehicle, a
// category), keep the warranty and the last day to return it, let the local AI read it, see the
// year in numbers and export it.
import { useState } from "react";
import { BarChart3, Bot, Camera, Download, ImageIcon, MessageSquareWarning, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { api, Member, Property, Vehicle } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { keepPreviousData } from "@tanstack/react-query";
import { uploadReceipt } from "@/lib/receipts";
import { useAiStatus } from "@/components/LocalAi";
import { EmptyState } from "@/components/PageTitle";

export const RECEIPT_CATEGORIES = ["food", "home", "vehicle", "clothes", "children", "health", "leisure", "electronics", "gifts", "travel", "other"] as const;

export type ReceiptRow = {
  id: string;
  media_id: string | null;
  store: string;
  amount: number | null;
  currency: string;
  purchased_on: string | null;
  category: string;
  property_id: string | null;
  property_name: string | null;
  vehicle_id: string | null;
  vehicle_name: string | null;
  note: string | null;
  has_text: boolean;
  warranty_until: string | null;
  complaint_until: string | null;
  return_until: string | null;
  returned_at: string | null;
  child_id: string | null;
  child_name: string | null;
  split_pct: number | null;
  mine: boolean;
  created_at: string;
};

type Shared = { child_id: string; child_name: string | null; month: number; total: number; their_part: number; count: number };

type Stats = { year: number; currency: string; total: number; by_category: { category: string; total: number; count: number }[]; by_month: number[]; by_store: { store: string; total: number }[] };

type Form = {
  id: string | null;
  store: string;
  amount: string;
  currency: string;
  purchased_on: string;
  category: string;
  property_id: string;
  vehicle_id: string;
  note: string;
  return_until: string;
  warranty_until: string;
  child_id: string;
  split_pct: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function plus(iso: string, days: number = 0, months: number = 0): string {
  const d = new Date(`${iso || today()}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const blank = (): Form => ({ id: null, store: "", amount: "", currency: "", purchased_on: today(), category: "other", property_id: "", vehicle_id: "", note: "", return_until: "", warranty_until: "", child_id: "", split_pct: "50" });

export default function Receipts({ query, onOpenPhoto }: { query: string; onOpenPhoto: (mediaId: string, title: string) => void }) {
  const { t, dateLocale } = useI18n();
  const ai = useAiStatus();
  const [show, setShow] = useState<"" | "returns" | "warranty">("");
  const [category, setCategory] = useState("");
  const [home, setHome] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [showStats, setShowStats] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicates, setDuplicates] = useState<{ added: ReceiptRow; same: ReceiptRow[] } | null>(null);
  // Let the local AI read a new receipt's photo or screenshot at once.
  const [readWithAi, setReadWithAi] = useState(true);
  const [complaining, setComplaining] = useState<string | null>(null);
  const [problem, setProblem] = useState("");

  // From the cache: a saved receipt, or one the local AI has read (it tells with a notification,
  // RELATED to receipts), refreshes it. Typing in the search keeps the last answer until the next.
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (show) params.set("show", show);
  if (category) params.set("category", category);
  if (home) params.set("property_id", home);
  if (vehicle) params.set("vehicle_id", vehicle);
  const rowsQuery = useApi<ReceiptRow[]>(`/api/receipts?${params}`, { placeholderData: keepPreviousData });
  const rows = rowsQuery.data ?? (rowsQuery.isError ? NONE : null);
  const stats = useApi<Stats>(`/api/receipts/stats?year=${year}`, { placeholderData: keepPreviousData }).data ?? null;
  const shared = useApi<Shared[]>(`/api/receipts/shared?year=${year}`).data ?? NONE;
  const homes = useApi<Property[]>("/api/property/properties").data ?? NONE;
  const vehicles = useApi<Vehicle[]>("/api/vehicles").data ?? NONE;
  const children = (useApi<Member[]>("/api/family/members").data ?? NONE).filter((x) => x.role === "child");

  const currency = stats?.currency ?? "";
  const money = (v: number, cur?: string) => `${v.toLocaleString(dateLocale, { maximumFractionDigits: 2 })} ${cur || currency}`.trim();
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale);
  const catLabel = (c: string) => t(`receipts.cat.${c}` as TranslationKey);

  function edit(r: ReceiptRow) {
    setPhoto(null);
    setDuplicates(null);
    setForm({
      id: r.id, store: r.store, amount: r.amount?.toString() ?? "", currency: r.currency, purchased_on: r.purchased_on ?? "", category: r.category,
      property_id: r.property_id ?? "", vehicle_id: r.vehicle_id ?? "", note: r.note ?? "", return_until: r.return_until ?? "", warranty_until: r.warranty_until ?? "",
      child_id: r.child_id ?? "", split_pct: String(r.split_pct ?? 50),
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage("");
    try {
      const body = {
        store: form.store.trim(), amount: form.amount.trim() ? Number(form.amount.replace(",", ".")) : null, currency: form.currency.trim().toUpperCase(),
        purchased_on: form.purchased_on || null, category: form.category, property_id: form.property_id || null, vehicle_id: form.vehicle_id || null,
        note: form.note.trim() || null, return_until: form.return_until || null, warranty_until: form.warranty_until || null,
        child_id: form.child_id || null, split_pct: form.child_id ? Math.min(100, Math.max(1, Number(form.split_pct) || 50)) : null,
      };
      if (form.id) {
        await api.patch(`/api/receipts/${form.id}`, body);
      } else {
        const media_id = photo ? await uploadReceipt(photo) : null;
        const created = await api.post<{ receipt: ReceiptRow; duplicates: ReceiptRow[] }>("/api/receipts", { ...body, media_id });
        if (created.duplicates.length) setDuplicates({ added: created.receipt, same: created.duplicates });
        if (media_id && readWithAi && ai?.available) {
          await api.post("/api/ai/jobs", { kind: "receipt_info", receipt_id: created.receipt.id });
          setMessage(t("receipts.aiQueued"));
        }
      }
      setForm(null);
      setPhoto(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<unknown>, done?: string) {
    setMessage("");
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  const soon = (iso: string) => (new Date(`${iso}T23:59:59`).getTime() - Date.now()) / 86_400_000 <= 7;

  return (
    <section className="space-y-3" aria-label={t("receipts.title")}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => { setForm(blank()); setPhoto(null); setDuplicates(null); }}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("receipts.add")}
        </button>
        {(["", "returns", "warranty"] as const).map((s) => (
          <button key={s || "all"} aria-pressed={show === s} className={`rounded-full border px-3 py-1 text-sm ${show === s ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} onClick={() => setShow(s)}>
            {t(s === "" ? "receipts.showAll" : s === "returns" ? "receipts.showReturns" : "receipts.showWarranty")}
          </button>
        ))}
        <button className={`ml-auto flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${showStats ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} aria-pressed={showStats} onClick={() => setShowStats(!showStats)}>
          <BarChart3 className="h-4 w-4" aria-hidden />
          {t("receipts.stats")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("receipts.category")}>
          <option value="">{t("receipts.allCategories")}</option>
          {RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
        </select>
        {homes.length > 0 && (
          <select className="input w-auto" value={home} onChange={(e) => setHome(e.target.value)} aria-label={t("receipts.home")}>
            <option value="">{t("receipts.allHomes")}</option>
            {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        )}
        {vehicles.length > 0 && (
          <select className="input w-auto" value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label={t("receipts.vehicle")}>
            <option value="">{t("receipts.allVehicles")}</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </div>

      {duplicates && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{t("receipts.duplicate")}</p>
          <ul className="mt-1 text-xs">
            {duplicates.same.map((d) => <li key={d.id}>{[d.store, d.purchased_on && day(d.purchased_on), d.amount !== null && money(d.amount, d.currency)].filter(Boolean).join(" · ")}</li>)}
          </ul>
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost border border-amber-300 text-xs" onClick={() => act(() => api.del(`/api/receipts/${duplicates.added.id}`)).then(() => setDuplicates(null))}>{t("receipts.removeNew")}</button>
            <button className="btn-ghost text-xs" onClick={() => setDuplicates(null)}>{t("receipts.keepBoth")}</button>
          </div>
        </div>
      )}

      {form && (
        <form
          className="card grid gap-3 p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          onPaste={(e) => {
            // A screenshot pasted straight in (Ctrl+V): a receipt from the mail, Kivra or a shop's app.
            const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (file && !form.id) {
              e.preventDefault();
              setPhoto(new File([file], file.name || "screenshot.png", { type: file.type }));
            }
          }}
          aria-label={form.id ? t("receipts.edit") : t("receipts.add")}
        >
          {!form.id && (
            <div className="space-y-2 sm:col-span-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-edge px-3 py-2 text-sm">
                  <Camera className="h-4 w-4 text-muted" aria-hidden />
                  {t("receipts.takePhoto")}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-edge px-3 py-2 text-sm">
                  <ImageIcon className="h-4 w-4 text-muted" aria-hidden />
                  {t("receipts.chooseImage")}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
                {photo && <span className="self-center truncate text-sm">{photo.name}</span>}
              </div>
              <p className="text-xs text-muted">{t("receipts.pasteHint")}</p>
              {ai?.available && photo && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={readWithAi} onChange={(e) => setReadWithAi(e.target.checked)} />
                  {t("receipts.readWithAi")}
                </label>
              )}
            </div>
          )}
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.store")}</span>
            <input className="input mt-1 w-full" value={form.store} maxLength={120} onChange={(e) => setForm({ ...form, store: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.amount")}</span>
            <div className="mt-1 flex gap-1">
              <input className="input min-w-0 flex-1" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <input className="input w-16" maxLength={3} value={form.currency} placeholder={currency} aria-label={t("receipts.currency")} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.date")}</span>
            <input className="input mt-1 w-full" type="date" value={form.purchased_on} onChange={(e) => setForm({ ...form, purchased_on: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.category")}</span>
            <select className="input mt-1 w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.home")}</span>
            <select className="input mt-1 w-full" value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
              <option value="">–</option>
              {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.vehicle")}</span>
            <select className="input mt-1 w-full" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">–</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <div className="text-sm">
            <label className="text-xs text-muted" htmlFor="receipt-return">{t("receipts.returnUntil")}</label>
            <input id="receipt-return" className="input mt-1 w-full" type="date" value={form.return_until} onChange={(e) => setForm({ ...form, return_until: e.target.value })} />
            <div className="mt-1 flex gap-1">
              {[14, 30, 60].map((d) => (
                <button key={d} type="button" className="rounded border border-edge px-1.5 text-xs text-muted hover:text-ink" onClick={() => setForm({ ...form, return_until: plus(form.purchased_on, d) })}>
                  {t("receipts.days", { n: d })}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm">
            <label className="text-xs text-muted" htmlFor="receipt-warranty">{t("receipts.warrantyUntil")}</label>
            <input id="receipt-warranty" className="input mt-1 w-full" type="date" value={form.warranty_until} onChange={(e) => setForm({ ...form, warranty_until: e.target.value })} />
            <div className="mt-1 flex gap-1">
              {[1, 2, 5].map((y) => (
                <button key={y} type="button" className="rounded border border-edge px-1.5 text-xs text-muted hover:text-ink" onClick={() => setForm({ ...form, warranty_until: plus(form.purchased_on, 0, 12 * y) })}>
                  {t("receipts.years", { n: y })}
                </button>
              ))}
            </div>
          </div>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.note")}</span>
            <input className="input mt-1 w-full" value={form.note} maxLength={2000} placeholder={t("receipts.notePh")} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          {children.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 text-sm sm:col-span-3">
              <label>
                <span className="text-xs text-muted">{t("receipts.sharedFor")}</span>
                <select className="input mt-1 w-auto" value={form.child_id} onChange={(e) => setForm({ ...form, child_id: e.target.value })}>
                  <option value="">{t("receipts.notShared")}</option>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </label>
              {form.child_id && (
                <label>
                  <span className="text-xs text-muted">{t("receipts.theirShare")}</span>
                  <span className="mt-1 flex items-center gap-1">
                    <input className="input w-20" type="number" min={1} max={100} value={form.split_pct} onChange={(e) => setForm({ ...form, split_pct: e.target.value })} />%
                  </span>
                </label>
              )}
            </div>
          )}
          <p className="text-xs text-muted sm:col-span-3">{t("receipts.complaintHint")}</p>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" disabled={busy}>{busy ? t("common.loading") : t("receipts.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {message && <p role="status" className="text-sm text-muted">{message}</p>}

      {showStats && stats && (
        <div className="card p-4" aria-label={t("receipts.stats")}>
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold">{t("receipts.yearTotal", { year: stats.year, total: money(stats.total) })}</h3>
            <select className="input w-auto py-1" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("receipts.year")}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <a className="btn-ghost border border-edge text-sm" href={`/api/receipts/export.csv?year=${year}`} download>
              <Download className="h-4 w-4" aria-hidden />
              {t("receipts.export")}
            </a>
          </div>
          {shared.length > 0 && (
            <div className="mt-3 rounded bg-base p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("receipts.sharedTitle")}</p>
              <table className="mt-1 w-full text-left">
                <tbody>
                  {shared.map((s) => (
                    <tr key={`${s.child_id}-${s.month}`}>
                      <td className="py-0.5">{s.child_name} · {new Date(2000, s.month - 1, 1).toLocaleDateString(dateLocale, { month: "long" })}</td>
                      <td className="py-0.5 text-right tabular-nums">{money(s.total)}</td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">{t("receipts.theirPart", { amount: money(s.their_part) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted">{t("receipts.sharedHint")}</p>
            </div>
          )}
          {stats.total === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("receipts.noStats")}</p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("receipts.perCategory")}</p>
                <ul className="mt-1 space-y-1">
                  {stats.by_category.map((c) => (
                    <li key={c.category} className="text-sm">
                      <div className="flex justify-between"><span>{catLabel(c.category)}</span><span className="tabular-nums">{money(c.total)}</span></div>
                      <div className="h-1.5 rounded bg-base"><div className="h-1.5 rounded bg-accent" style={{ width: `${(c.total / stats.total) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("receipts.perMonth")}</p>
                <div className="mt-2 flex h-24 items-end gap-1" role="img" aria-label={t("receipts.perMonth")}>
                  {stats.by_month.map((v, i) => {
                    const top = Math.max(...stats.by_month, 1);
                    return <div key={i} className="flex-1 rounded-t bg-accent/70" style={{ height: `${Math.max((v / top) * 100, v > 0 ? 4 : 0)}%` }} title={`${new Date(2000, i, 1).toLocaleDateString(dateLocale, { month: "short" })}: ${money(v)}`} />;
                  })}
                </div>
                {stats.by_store.length > 0 && (
                  <>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("receipts.perStore")}</p>
                    <ul className="mt-1 text-sm">
                      {stats.by_store.map((s) => <li key={s.store} className="flex justify-between"><span className="truncate">{s.store}</span><span className="tabular-nums">{money(s.total)}</span></li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <EmptyState>{query || show || category || home || vehicle ? t("vault.noMatches") : t("receipts.empty")}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-start gap-3 p-3">
              {r.media_id ? (
                <button className="h-14 w-14 shrink-0 overflow-hidden rounded border border-edge" onClick={() => onOpenPhoto(r.media_id!, r.store || t("receipts.title"))} aria-label={t("receipts.openPhoto")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/media/${r.media_id}/thumb`} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-dashed border-edge text-xs text-muted">{catLabel(r.category).slice(0, 3)}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{r.store || t("receipts.noStore")}</span>
                  {r.amount !== null && <span className="tabular-nums">{money(r.amount, r.currency)}</span>}
                  {r.purchased_on && <span className="text-xs text-muted">{day(r.purchased_on)}</span>}
                </p>
                <p className="text-xs text-muted">{[catLabel(r.category), r.property_name, r.vehicle_name, r.child_name && t("receipts.sharedChip", { name: r.child_name, pct: r.split_pct ?? 50 }), r.note].filter(Boolean).join(" · ")}</p>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  {r.returned_at ? (
                    <span className="rounded-full bg-base px-2 py-0.5">{t("receipts.returned")}</span>
                  ) : (
                    <>
                      {r.return_until && r.return_until >= today() && (
                        <span className={`rounded-full px-2 py-0.5 ${soon(r.return_until) ? "bg-amber-100 text-amber-900" : "bg-base"}`}>{t("receipts.returnBy", { date: day(r.return_until) })}</span>
                      )}
                      {r.warranty_until && r.warranty_until >= today() && <span className="rounded-full bg-base px-2 py-0.5">{t("receipts.warrantyTo", { date: day(r.warranty_until) })}</span>}
                      {r.complaint_until && r.complaint_until >= today() && <span className="rounded-full bg-base px-2 py-0.5 text-muted">{t("receipts.complaintTo", { date: day(r.complaint_until) })}</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {ai?.available && r.media_id && !r.has_text && (
                  <button className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" title={t("receipts.aiRead")} aria-label={t("receipts.aiRead")} onClick={() => act(() => api.post("/api/ai/jobs", { kind: "receipt_info", receipt_id: r.id }), t("receipts.aiQueued"))}>
                    <Bot className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {ai?.available && !r.returned_at && r.category !== "food" && (
                  <button className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" title={t("receipts.complain")} aria-label={t("receipts.complain")} aria-expanded={complaining === r.id} onClick={() => { setComplaining(complaining === r.id ? null : r.id); setProblem(""); }}>
                    <MessageSquareWarning className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {r.return_until && (
                  <button className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" title={r.returned_at ? t("receipts.notReturned") : t("receipts.markReturned")} aria-label={r.returned_at ? t("receipts.notReturned") : t("receipts.markReturned")} onClick={() => act(() => api.post(`/api/receipts/${r.id}/returned`, { returned: !r.returned_at }))}>
                    <Undo2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <button className="rounded p-1.5 text-muted hover:bg-base hover:text-ink" aria-label={t("receipts.edit")} title={t("receipts.edit")} onClick={() => edit(r)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button className="rounded p-1.5 text-muted hover:bg-base hover:text-red-700" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => confirm(t("receipts.confirmDelete")) && act(() => api.del(`/api/receipts/${r.id}`))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {complaining === r.id && (
                <div className="basis-full rounded border border-edge p-2 text-sm">
                  <label className="text-xs text-muted" htmlFor={`problem-${r.id}`}>{t("receipts.whatIsWrong")}</label>
                  <textarea id={`problem-${r.id}`} className="input mt-1 min-h-20 w-full" maxLength={2000} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder={t("receipts.whatIsWrongPh")} />
                  <button className="btn-primary mt-2" disabled={problem.trim().length < 5} onClick={() => act(() => api.post("/api/ai/jobs", { kind: "complaint_letter", receipt_id: r.id, text: problem.trim() }), t("receipts.complaintQueued")).then(() => setComplaining(null))}>
                    {t("receipts.writeComplaint")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
