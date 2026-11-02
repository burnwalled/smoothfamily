"use client";

// The household's economy (2.8.5), for the adults: what the family spends by category – food, the
// house, the cabin, the car … – gathered from receipts, homes, vehicles and trips, plus incomes
// (each adult adds their own) and costs of its own, with a budget per category.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, Plus, Repeat, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { keepPreviousData } from "@tanstack/react-query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";

const OUT = ["food", "housing", "transport", "children", "clothes", "health", "leisure", "electronics", "gifts", "travel", "insurance", "subscriptions", "savings", "other"];
const IN = ["salary", "benefits", "other_income"];

type Row = { key: string; label: string | null; total: number; months: number[]; budget: number | null };
type Overview = {
  year: number;
  currency: string;
  months: { month: number; out: number; in: number }[];
  out: Row[];
  in: Row[];
  total_out: number;
  total_in: number;
  earners: { name: string; total: number }[];
  homes: { key: string; label: string }[];
  vehicles: { key: string; label: string }[];
};
type Entry = { id: string; kind: "in" | "out"; category: string; amount: number; day: string; note: string; recurring: string; private: boolean; source: string; mine: boolean };

export default function EconomyPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [year, setYear] = useState(new Date().getFullYear());
  // From the cache: an entry here, or a receipt, a home's or a vehicle's cost (RELATED), refreshes it.
  const overview = useApi<Overview>(`/api/economy?year=${year}`, { placeholderData: keepPreviousData });
  const view = overview.data ?? null;
  const entries = useApi<Entry[]>(`/api/economy/entries?year=${year}`, { placeholderData: keepPreviousData }).data ?? NONE;
  const [form, setForm] = useState({ kind: "out" as "in" | "out", category: "food", amount: "", day: new Date().toISOString().slice(0, 10), note: "", recurring: "", private: false });
  const [adding, setAdding] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (overview.error) setError(overview.error.message);
  }, [overview.error]);

  const money = (v: number) => `${Math.round(v).toLocaleString(dateLocale)} ${view?.currency ?? ""}`.trim();
  const label = (key: string, fallback?: string | null) => {
    if (fallback) return fallback;
    const own = [...(view?.homes ?? []), ...(view?.vehicles ?? [])].find((x) => x.key === key);
    if (own) return own.label;
    return t(`economy.cat.${key}` as TranslationKey);
  };
  const icon = (key: string) => (key.startsWith("home:") ? "🏠 " : key.startsWith("vehicle:") ? "🚗 " : "");
  const thisMonth = year === new Date().getFullYear() ? new Date().getMonth() : 11;
  const outKeys = useMemo(() => [...OUT, ...(view?.homes ?? []).map((h) => h.key), ...(view?.vehicles ?? []).map((v) => v.key)], [view]);
  const top = Math.max(...(view?.months ?? []).map((m) => Math.max(m.in, m.out)), 1);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function add() {
    const amount = Number(form.amount.replace(",", ".").replace(/\s/g, ""));
    if (!(amount > 0)) return;
    await run(async () => {
      await api.post("/api/economy/entries", { ...form, amount, note: form.note.trim() });
      setForm({ ...form, amount: "", note: "" });
      setAdding(false);
    });
  }

  if (me.role === "child") return <EmptyState>{t("economy.adultsOnly")}</EmptyState>;
  return (
    <>
      <PageTitle title={t("nav.economy")} icon={Wallet} />
      <p className="mt-1 text-sm text-muted">{t("economy.intro")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("receipts.year")}>
          {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="btn-primary" onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("economy.add")}
        </button>
        <button className="btn-ghost border border-edge" onClick={() => setBudgets(budgets ? null : Object.fromEntries((view?.out ?? []).filter((r) => r.budget).map((r) => [r.key, String(r.budget)])))} aria-expanded={!!budgets}>
          {t("economy.budgets")}
        </button>
        <Link href="/bank-import" className="btn-ghost border border-edge">{t("economy.fromBank")}</Link>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {adding && (
        <form
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          aria-label={t("economy.add")}
        >
          <div className="flex gap-2 sm:col-span-3" role="radiogroup" aria-label={t("economy.kind")}>
            {(["out", "in"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={form.kind === k} className={`rounded-full border px-3 py-1 text-sm ${form.kind === k ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted"}`} onClick={() => setForm({ ...form, kind: k, category: k === "in" ? "salary" : "food" })}>
                {t(k === "in" ? "economy.income" : "economy.cost")}
              </button>
            ))}
          </div>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("economy.category")}</span>
            <select className="input mt-1 w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(form.kind === "in" ? IN : outKeys).map((k) => <option key={k} value={k}>{icon(k)}{label(k)}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.amount")}</span>
            <input className="input mt-1 w-full" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("receipts.date")}</span>
            <input className="input mt-1 w-full" type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("economy.repeats")}</span>
            <select className="input mt-1 w-full" value={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.value })}>
              <option value="">{t("economy.once")}</option>
              <option value="monthly">{t("economy.monthly")}</option>
              <option value="quarterly">{t("economy.quarterly")}</option>
              <option value="yearly">{t("economy.yearly")}</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-muted">{t("economy.note")}</span>
            <input className="input mt-1 w-full" maxLength={200} value={form.note} placeholder={t(form.kind === "in" ? "economy.incomePh" : "economy.notePh")} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.private} onChange={(e) => setForm({ ...form, private: e.target.checked })} />
            {t("economy.private")}
          </label>
          {form.kind === "in" && <p className="text-xs text-muted sm:col-span-3">{t("economy.incomeHint")}</p>}
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary">{t("economy.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</button>
          </div>
        </form>
      )}

      {budgets && (
        <section className="card mt-3 p-4" aria-label={t("economy.budgets")}>
          <p className="text-xs text-muted">{t("economy.budgetHint")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {outKeys.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{icon(k)}{label(k)}</span>
                <input className="input w-28 py-1" inputMode="numeric" value={budgets[k] ?? ""} onChange={(e) => setBudgets({ ...budgets, [k]: e.target.value })} aria-label={t("economy.budgetFor", { name: label(k) })} />
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" onClick={() => run(async () => {
            const changed = Object.fromEntries(outKeys.map((k) => [k, Number((budgets[k] ?? "").replace(/\s/g, "")) || 0]));
            await api.put("/api/economy/budgets", { budgets: changed });
            setBudgets(null);
          })}>{t("economy.save")}</button>
        </section>
      )}

      {view && (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-muted">{t("economy.totalIn")}</p><p className="text-xl font-bold tabular-nums text-emerald-700">{money(view.total_in)}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-muted">{t("economy.totalOut")}</p><p className="text-xl font-bold tabular-nums">{money(view.total_out)}</p></div>
            <div className="card p-4"><p className="text-xs uppercase tracking-wide text-muted">{t("economy.left")}</p><p className={`text-xl font-bold tabular-nums ${view.total_in - view.total_out < 0 ? "text-red-700" : ""}`}>{view.total_in ? money(view.total_in - view.total_out) : "–"}</p></div>
          </section>

          <section className="card mt-4 p-4" aria-label={t("economy.perMonth")}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("economy.perMonth")}</h2>
            <div className="mt-3 flex h-32 items-end gap-1.5">
              {view.months.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${new Date(2000, m.month - 1, 1).toLocaleDateString(dateLocale, { month: "long" })}: ${t("economy.in")} ${money(m.in)} · ${t("economy.out")} ${money(m.out)}`}>
                  <div className="flex h-full w-full items-end gap-px">
                    <div className="flex-1 rounded-t bg-emerald-500/70" style={{ height: `${(m.in / top) * 100}%` }} />
                    <div className="flex-1 rounded-t bg-accent/80" style={{ height: `${(m.out / top) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted">{new Date(2000, m.month - 1, 1).toLocaleDateString(dateLocale, { month: "narrow" })}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500/70" />{t("economy.in")}</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/80" />{t("economy.out")}</span></p>
          </section>

          <section className="card mt-4 p-4" aria-label={t("economy.perCategory")}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("economy.perCategory")}</h2>
            {view.out.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("economy.empty")}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {view.out.map((r) => {
                  const now = r.months[thisMonth] ?? 0;
                  const over = r.budget !== null && now > r.budget;
                  return (
                    <li key={r.key} className="text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate">{icon(r.key)}{label(r.key, r.label)}</span>
                        <span className="tabular-nums">{money(r.total)}</span>
                      </div>
                      <div className="h-1.5 rounded bg-base"><div className="h-1.5 rounded bg-accent" style={{ width: `${view.total_out ? (r.total / view.total_out) * 100 : 0}%` }} /></div>
                      {r.budget !== null && (
                        <p className={`text-xs ${over ? "text-red-700" : "text-muted"}`}>{t("economy.budgetNow", { now: money(now), budget: money(r.budget) })}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {(view.in.length > 0 || view.earners.length > 0) && (
            <section className="card mt-4 p-4" aria-label={t("economy.incomes")}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("economy.incomes")}</h2>
              <ul className="mt-2 text-sm">
                {view.in.map((r) => <li key={r.key} className="flex justify-between"><span>{label(r.key)}</span><span className="tabular-nums">{money(r.total)}</span></li>)}
              </ul>
              {view.earners.length > 1 && (
                <p className="mt-2 text-xs text-muted">{view.earners.map((e) => `${e.name} ${money(e.total)}`).join(" · ")}</p>
              )}
            </section>
          )}

          <section className="card mt-4 p-4" aria-label={t("economy.entries")}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("economy.entries")}</h2>
            <p className="text-xs text-muted">{t("economy.entriesHint")}</p>
            {entries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("economy.noEntries")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-edge text-sm">
                {entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="w-20 text-xs text-muted">{new Date(`${e.day}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {icon(e.category)}{label(e.category)}{e.note && <span className="text-muted"> · {e.note}</span>}
                      {e.recurring && <Repeat className="ml-1 inline h-3 w-3 text-muted" aria-label={t(`economy.${e.recurring}` as TranslationKey)} />}
                      {e.private && <Lock className="ml-1 inline h-3 w-3 text-muted" aria-label={t("economy.privateShort")} />}
                      {e.source === "bank" && <span className="ml-1 rounded bg-base px-1 text-[10px] text-muted">{t("economy.bank")}</span>}
                    </span>
                    <span className={`tabular-nums ${e.kind === "in" ? "text-emerald-700" : ""}`}>{e.kind === "in" ? "+" : "−"}{money(e.amount)}</span>
                    {e.mine && (
                      <button className="text-muted hover:text-red-700" aria-label={t("common.remove")} onClick={() => run(() => api.del(`/api/economy/entries/${e.id}`))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
