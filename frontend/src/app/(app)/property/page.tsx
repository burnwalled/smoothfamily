"use client";

// Homes (2.6.5): a card per home with what matters now – the maintenance that is due, this year's
// costs against last year, the energy use and the open projects – and, for the chosen one, its
// maintenance (which can become a task), costs, projects, the things in it, energy, documents and
// settings. A receipt or invoice can be read by the local AI; everything works by hand too.
import LinkedTasks from "@/components/tasks/LinkedTasks";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, Download, ExternalLink, FileText, Home, Plus, Search, Trash2 } from "lucide-react";
import {
  api,
  HomeCard,
  Member,
  Property,
  PropertyEnergy,
  PropertyExpense,
  PropertyItem,
  PropertyMeter,
  PropertyProject,
  PropertyRecurringCost,
  PropertyReminder,
  UtilityReading,
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
import { nextDay } from "@/lib/vehicleKinds";
import { DWELLING_ORDER, dwellingInfo, dwellingLabel, Upkeep, upkeepLabel } from "@/lib/propertyKinds";
import AddressInput from "@/components/AddressInput";

const CATEGORIES = ["maintenance", "renovation", "repair", "tax", "insurance", "utility", "loan", "other"] as const;
const KINDS = ["maintenance", "safety", "inspection", "season", "insurance", "warranty", "other"] as const;
const STATUSES = ["planned", "active", "paused", "done"] as const;
const METERS = [
  { kind: "electricity", unit: "kWh" },
  { kind: "water", unit: "m³" },
  { kind: "heating", unit: "kWh" },
  { kind: "gas", unit: "m³" },
] as const;
const today = () => new Date().toISOString().slice(0, 10);
const inMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
const num = (value: string) => (value.trim() ? Number(value.replace(",", ".").replace(/\s/g, "")) : null);
const STATUS_CLASS = { overdue: "bg-red-100 text-red-800", soon: "bg-amber-100 text-amber-900", ok: "bg-base text-muted" };

function useMoney(currency: string) {
  const { dateLocale } = useI18n();
  return {
    money: (value: number) => `${Math.round(value).toLocaleString(dateLocale)} ${currency}`,
    day: (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }),
    amount: (value: number) => value.toLocaleString(dateLocale, { maximumFractionDigits: 1 }),
  };
}

function when(r: PropertyReminder, t: ReturnType<typeof useI18n>["t"], day: (iso: string) => string) {
  if (r.days_left < 0) return t("vehicles.overdueDays", { n: -r.days_left });
  if (r.days_left === 0) return t("vehicles.dueToday");
  return r.days_left <= 60 ? t("vehicles.inDays", { n: r.days_left }) : day(r.due_date);
}

function Chip({ r, day }: { r: PropertyReminder; day: (iso: string) => string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[r.status]}`}>
      {r.title}
      <span className="font-normal">{when(r, t, day)}</span>
    </span>
  );
}

function OverviewCard({ card, active, onOpen }: { card: HomeCard; active: boolean; onOpen: () => void }) {
  const { t } = useI18n();
  const f = useMoney(card.currency);
  const p = card.property;
  const diff = card.cost_this_year - card.cost_last_year_to_date;
  return (
    <li>
      <button className={`card w-full space-y-2 p-4 text-left ${active ? "ring-2 ring-accent" : ""}`} onClick={onOpen} aria-pressed={active}>
        <p className="flex items-center gap-2 text-lg font-bold">
          <span aria-hidden>{dwellingInfo(p.dwelling).icon}</span>
          {p.name}
        </p>
        <p className="text-xs text-muted">{[t(dwellingLabel(p.dwelling ?? "villa")), p.address, p.built_year && t("property.builtIn", { year: p.built_year }), p.area_m2 && `${p.area_m2} m²`].filter(Boolean).join(" · ")}</p>
        {card.reminders.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">{card.reminders.slice(0, 3).map((r) => <Chip key={r.id} r={r} day={f.day} />)}</div>
        ) : (
          <p className="text-xs text-muted">{t("property.noUpkeep")}</p>
        )}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t("vehicles.costThisYear")}</dt>
            <dd className="font-semibold">{f.money(card.cost_this_year)}</dd>
            {card.cost_last_year_to_date > 0 && (
              <dd className={`text-xs ${diff > 0 ? "text-red-700" : "text-emerald-700"}`}>{t(diff > 0 ? "vehicles.moreThanLastYear" : "vehicles.lessThanLastYear", { amount: f.money(Math.abs(diff)) })}</dd>
            )}
          </div>
          {card.recurring_monthly > 0 && (
            <div>
              <dt className="text-xs text-muted">{t("property.monthlyRecurring")}</dt>
              <dd className="font-semibold">{f.money(card.recurring_monthly)}</dd>
            </div>
          )}
          {card.energy.map((e) => (
            <div key={e.kind}>
              <dt className="text-xs text-muted">{t(`property.meter.${e.kind}` as TranslationKey)} {t("property.thisYear")}</dt>
              <dd className="font-semibold">{f.amount(e.this_year)} {e.unit}</dd>
              {e.last_year_to_date > 0 && <dd className="text-xs text-muted">{t("property.lastYearSame", { amount: `${f.amount(e.last_year_to_date)} ${e.unit}` })}</dd>}
            </div>
          ))}
          {card.projects.length > 0 && (
            <div>
              <dt className="text-xs text-muted">{t("property.openProjects")}</dt>
              <dd className="font-semibold">{card.projects.length}</dd>
            </div>
          )}
          {card.items > 0 && (
            <div>
              <dt className="text-xs text-muted">{t("property.things")}</dt>
              <dd className="font-semibold">{card.items}</dd>
              {card.warranties_ending > 0 && <dd className="text-xs text-amber-800">{t("property.warrantiesEnding", { n: card.warranties_ending })}</dd>}
            </div>
          )}
        </dl>
      </button>
    </li>
  );
}

type UpkeepForm = { id: string; kind: string; title: string; due_date: string; repeat_months: string; remind_days: string; assignee_id: string; task_points: string; item_id: string | null };

function UpkeepTab({ home, reminders, currency }: { home: Property; reminders: PropertyReminder[]; currency: string }) {
  const { t } = useI18n();
  const f = useMoney(currency);
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const blank: UpkeepForm = { id: "", kind: "maintenance", title: "", due_date: inMonths(1), repeat_months: "12", remind_days: "14", assignee_id: "", task_points: "10", item_id: null };
  const [form, setForm] = useState<UpkeepForm | null>(null);
  const [doneFor, setDoneFor] = useState<{ id: string; date: string } | null>(null);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function suggest(u: Upkeep) {
    setForm({ ...blank, kind: u.kind, title: t(upkeepLabel(u.key)), due_date: u.day ? nextDay(u.day) : inMonths(1), repeat_months: String(u.months) });
  }

  const titles = new Set(reminders.map((r) => r.title));
  const suggestions = dwellingInfo(home.dwelling).upkeep.filter((u) => !titles.has(t(upkeepLabel(u.key))));
  const who = (id: string | null) => members.find((m) => m.id === id)?.display_name;

  return (
    <div className="space-y-3">
      {reminders.length === 0 && !form && <EmptyState>{t("property.upkeepEmpty")}</EmptyState>}
      <ul className="space-y-2">
        {reminders.map((r) => (
          <li key={r.id} className="rounded-lg border border-edge p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip r={r} day={f.day} />
              <span className="text-xs text-muted">
                {[f.day(r.due_date), r.repeat_months && t("vehicles.repeats", { every: t("vehicles.months", { n: r.repeat_months }) }), r.assignee_id && t("property.taskFor", { name: who(r.assignee_id) ?? "", points: r.task_points })]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="ml-auto flex gap-2">
                <button className="btn-primary px-3 py-1 text-sm" onClick={() => setDoneFor({ id: r.id, date: today() })}>{t("vehicles.markDone")}</button>
                <button
                  className="btn-ghost border border-edge px-3 py-1 text-sm"
                  onClick={() =>
                    setForm({
                      id: r.id, kind: r.kind, title: r.title, due_date: r.due_date, repeat_months: r.repeat_months?.toString() ?? "", remind_days: String(r.remind_days),
                      assignee_id: r.assignee_id ?? "", task_points: String(r.task_points), item_id: r.item_id,
                    })
                  }
                >
                  {t("vehicles.change")}
                </button>
                <button className="btn-ghost px-2 text-red-700" onClick={() => run(() => api.del(`/api/property/reminders/${r.id}`))} aria-label={t("vehicles.removeReminder")}>
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
                    await api.post(`/api/property/reminders/${r.id}/done`, { done_date: doneFor.date });
                    setDoneFor(null);
                  });
                }}
              >
                <label className="text-sm">
                  <span className="text-xs text-muted">{t("vehicles.doneOn")}</span>
                  <input className="input mt-1 block" type="date" value={doneFor.date} onChange={(e) => setDoneFor({ ...doneFor, date: e.target.value })} />
                </label>
                <button className="btn-primary">{t("vehicles.saveDone")}</button>
                <button type="button" className="btn-ghost" onClick={() => setDoneFor(null)}>{t("common.cancel")}</button>
                <p className="w-full text-xs text-muted">{r.repeat_months ? t("vehicles.doneNext") : t("vehicles.doneOnce")}</p>
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
            const body = {
              property_id: home.id, kind: form.kind, title: form.title.trim(), due_date: form.due_date, repeat_months: num(form.repeat_months),
              remind_days: num(form.remind_days) ?? 14, assignee_id: form.assignee_id || null, task_points: num(form.task_points) ?? 10, item_id: form.item_id,
            };
            run(async () => {
              if (form.id) await api.patch(`/api/property/reminders/${form.id}`, body);
              else await api.post("/api/property/reminders", body);
              setForm(null);
            });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs text-muted">{t("property.upkeepTitle")}</span>
              <input className="input mt-1 w-full" value={form.title} required maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.reminderKind")}</span>
              <select className="input mt-1 w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`property.upkeepKind.${k}` as TranslationKey)}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.dueDate")}</span>
              <input className="input mt-1 w-full" type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.repeatMonths")}</span>
              <input className="input mt-1 w-full" inputMode="numeric" value={form.repeat_months} onChange={(e) => setForm({ ...form, repeat_months: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("vehicles.remindDays")}</span>
              <input className="input mt-1 w-full" inputMode="numeric" value={form.remind_days} onChange={(e) => setForm({ ...form, remind_days: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">{t("property.asTask")}</span>
              <select className="input mt-1 w-full" value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">{t("property.noTask")}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            </label>
            {form.assignee_id && (
              <label className="text-sm">
                <span className="text-xs text-muted">{t("easy.points")}</span>
                <input className="input mt-1 w-full" inputMode="numeric" value={form.task_points} onChange={(e) => setForm({ ...form, task_points: e.target.value })} />
              </label>
            )}
          </div>
          <p className="text-xs text-muted">{t("property.upkeepHelp")}</p>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={!form.title.trim() || !form.due_date}>{t("vehicles.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted">{t("property.suggestions", { kind: t(dwellingLabel(home.dwelling ?? "villa")).toLowerCase() })}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {suggestions.map((u) => (
                  <button key={u.key} className="rounded-full border border-edge px-3 py-1 text-sm hover:bg-base" onClick={() => suggest(u)}>
                    + {t(upkeepLabel(u.key))}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setForm(blank)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("property.addUpkeep")}
          </button>
        </div>
      )}
      <div className="border-t border-edge pt-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("linkedTasks.title")}</h3>
        <p className="mb-2 text-xs text-muted">{t("linkedTasks.homeHint")}</p>
        <LinkedTasks link={{ property_id: home.id }} placeholder={t("linkedTasks.add")} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

type CostForm = { id: string; name: string; amount: string; expense_date: string; category: string; project_id: string; receipt_media_id: string | null };

function CostsTab({ home, currency, projects }: { home: Property; currency: string; projects: PropertyProject[] }) {
  const { t } = useI18n();
  const f = useMoney(currency);
  const rows = useApi<PropertyExpense[]>(`/api/property/expenses?property_id=${home.id}`).data ?? NONE;
  const blank: CostForm = { id: "", name: "", amount: "", expense_date: today(), category: "maintenance", project_id: "", receipt_media_id: null };
  const [form, setForm] = useState<CostForm>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const aiStatus = useAiStatus();
  const aiJob = useAiJob();

  async function save() {
    const amount = num(form.amount);
    if (!form.name.trim() || !amount) return;
    setBusy(true);
    setError("");
    try {
      const receipt = file ? await uploadReceipt(file) : form.receipt_media_id;
      const body = { property_id: home.id, project_id: form.project_id || null, name: form.name.trim(), amount, expense_date: form.expense_date, category: form.category, receipt_media_id: receipt };
      if (form.id) await api.patch(`/api/property/expenses/${form.id}`, body);
      else await api.post("/api/property/expenses", body);
      setForm(blank);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function readPhoto(photo: File) {
    await aiJob.start(async () => {
      const media = await uploadReceipt(photo);
      return api.post<AiJob>("/api/ai/jobs", { kind: "property_receipt", property_id: home.id, media_id: media });
    });
  }

  async function readPdf(pdf: File) {
    await aiJob.start(async () => {
      const data = new FormData();
      data.append("file", pdf);
      const resp = await fetch(`/api/ai/jobs/property-pdf?property_id=${home.id}`, { method: "POST", body: data, credentials: "same-origin" });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? t("common.error"));
      return (await resp.json()) as AiJob;
    });
  }

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <div className="space-y-4">
      {aiStatus?.available && (
        <div className="space-y-1 rounded-lg border border-edge p-3">
          <div className="flex flex-wrap gap-2">
            <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${aiJob.busy ? "opacity-60" : ""}`}>
              <Camera className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("property.readReceipt")}
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={aiJob.busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) readPhoto(x); }} />
            </label>
            <label className={`btn-ghost inline-flex cursor-pointer items-center gap-1.5 border border-edge ${aiJob.busy ? "opacity-60" : ""}`}>
              <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("property.readPdf")}
              <input type="file" accept="application/pdf" className="sr-only" disabled={aiJob.busy} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) readPdf(x); }} />
            </label>
          </div>
          <AiNote status={aiStatus} />
          {aiJob.note}
        </div>
      )}
      <Link href="/bank-import" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">🏦 {t("bank.fromBank")}</Link>
      <form className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label={t("property.category")}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`property.cat.${c}` as TranslationKey)}</option>)}
        </select>
        <input className="input" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("property.costNamePh")} aria-label={t("property.expenseNamePh")} />
        <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={t("vehicles.amountIn", { currency })} aria-label={t("property.amountPh")} />
        <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} aria-label={t("property.date")} />
        {projects.length > 0 && (
          <select className="input" value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} aria-label={t("property.project")}>
            <option value="">{t("property.noProject")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <ReceiptPicker file={file} onChange={setFile} className={projects.length ? "" : "sm:col-span-2"} />
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={busy || !form.name.trim() || !form.amount.trim()}>{form.id ? t("vehicles.save") : t("property.addExpense")}</button>
          {form.id && <button type="button" className="btn-ghost" onClick={() => setForm(blank)}>{t("common.cancel")}</button>}
        </div>
        {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>
      {rows.length === 0 ? (
        <EmptyState>{t("vehicles.costsEmpty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-edge">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="w-24 text-xs text-muted">{f.day(row.expense_date)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{row.name}</span>{" "}
                <span className="text-xs text-muted">
                  {t(`property.cat.${row.category}` as TranslationKey)}
                  {row.project_id && <> · {projectName(row.project_id)}</>}
                  {row.receipt_media_id && <> · 🧾</>}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{f.money(row.amount)}</span>
              <button className="text-xs text-muted hover:underline" onClick={() => setForm({ id: row.id, name: row.name, amount: String(row.amount), expense_date: row.expense_date, category: row.category, project_id: row.project_id ?? "", receipt_media_id: row.receipt_media_id })}>
                {t("vehicles.change")}
              </button>
              <button className="text-red-700" onClick={() => api.del(`/api/property/expenses/${row.id}`)} aria-label={t("vehicles.removeExpense", { name: row.name })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ProjectForm = { id: string; name: string; status: string; budget: string; started_at: string; finished_at: string; notes: string };

function ProjectsTab({ home, currency, projects }: { home: Property; currency: string; projects: PropertyProject[] }) {
  const { t } = useI18n();
  const f = useMoney(currency);
  const blank: ProjectForm = { id: "", name: "", status: "planned", budget: "", started_at: "", finished_at: "", notes: "" };
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  return (
    <div className="space-y-3">
      {projects.length === 0 && !form && <EmptyState>{t("property.projectsEmpty")}</EmptyState>}
      <ul className="space-y-2">
        {projects.map((p) => {
          const spent = p.spent ?? 0;
          const share = p.budget ? Math.min(100, Math.round((spent / p.budget) * 100)) : null;
          return (
            <li key={p.id} className="rounded-lg border border-edge p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                <span className="rounded-full bg-base px-2 py-0.5 text-xs">{t(`property.status.${p.status}` as TranslationKey)}</span>
                <span className="ml-auto flex gap-2">
                  <button className="btn-ghost border border-edge px-3 py-1 text-sm" onClick={() => setForm({ id: p.id, name: p.name, status: p.status, budget: p.budget?.toString() ?? "", started_at: p.started_at ?? "", finished_at: p.finished_at ?? "", notes: p.notes ?? "" })}>
                    {t("vehicles.change")}
                  </button>
                  <button className="btn-ghost px-2 text-red-700" onClick={() => run(() => api.del(`/api/property/projects/${p.id}`))} aria-label={t("property.removeProject", { name: p.name })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </div>
              <p className="mt-1 text-sm">
                {p.budget ? t("property.spentOfBudget", { spent: f.money(spent), budget: f.money(p.budget) }) : t("property.spent", { spent: f.money(spent) })}
                {p.budget && spent > p.budget && <span className="ml-2 font-semibold text-red-700">{t("property.overBudget", { amount: f.money(spent - p.budget) })}</span>}
              </p>
              {share !== null && (
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-base" aria-hidden>
                  <div className={`h-full ${spent > (p.budget ?? 0) ? "bg-red-500" : "bg-accent"}`} style={{ width: `${share}%` }} />
                </div>
              )}
              {p.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted">{p.notes}</p>}
            </li>
          );
        })}
      </ul>
      {form ? (
        <form
          className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const body = { property_id: home.id, name: form.name.trim(), status: form.status, budget: num(form.budget), started_at: form.started_at || null, finished_at: form.finished_at || null, notes: form.notes.trim() || null };
            run(async () => {
              if (form.id) await api.patch(`/api/property/projects/${form.id}`, body);
              else await api.post("/api/property/projects", body);
              setForm(null);
            });
          }}
        >
          <input className="input" value={form.name} required maxLength={200} placeholder={t("property.projectNamePh")} aria-label={t("property.projectNamePh")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.status} aria-label={t("property.projectStatus")} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`property.status.${s}` as TranslationKey)}</option>)}
          </select>
          <input className="input" inputMode="decimal" value={form.budget} placeholder={t("vehicles.amountIn", { currency })} aria-label={t("property.budgetPh")} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          <label className="text-sm">
            <span className="text-xs text-muted">{t("property.started")}</span>
            <input className="input mt-1 w-full" type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
          </label>
          <textarea className="input sm:col-span-2" rows={2} value={form.notes} placeholder={t("property.projectNotesPh")} aria-label={t("vehicles.field.notes")} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={!form.name.trim()}>{t("vehicles.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
        </form>
      ) : (
        <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setForm(blank)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("property.addProject")}
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

type ItemForm = { id: string; name: string; room: string; brand: string; model: string; serial: string; bought: string; price: string; warranty_until: string; manual_url: string; service_months: string; notes: string; receipt_media_id: string | null };

function ThingsTab({ home, currency }: { home: Property; currency: string }) {
  const { t } = useI18n();
  const f = useMoney(currency);
  const rows = useApi<PropertyItem[]>(`/api/property/items?property_id=${home.id}`).data ?? NONE;
  const blank: ItemForm = { id: "", name: "", room: "", brand: "", model: "", serial: "", bought: "", price: "", warranty_until: "", manual_url: "", service_months: "", notes: "", receipt_media_id: null };
  const [form, setForm] = useState<ItemForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const canSearch = useWebSearch().enabled;
  const [manualSearch, setManualSearch] = useState(false);
  const rooms = [...new Set(rows.map((r) => r.room).filter(Boolean))];

  async function save() {
    if (!form) return;
    setError("");
    try {
      const receipt = file ? await uploadReceipt(file) : form.receipt_media_id;
      const body = {
        property_id: home.id, name: form.name.trim(), room: form.room.trim(), brand: form.brand.trim(), model: form.model.trim(), serial: form.serial.trim(),
        bought: form.bought || null, price: num(form.price), warranty_until: form.warranty_until || null, manual_url: form.manual_url.trim(),
        service_months: num(form.service_months), notes: form.notes.trim() || null, receipt_media_id: receipt,
      };
      if (form.id) await api.patch(`/api/property/items/${form.id}`, body);
      else await api.post("/api/property/items", body);
      setForm(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const grouped = rows.reduce<Record<string, PropertyItem[]>>((acc, r) => {
    (acc[r.room || "–"] ??= []).push(r);
    return acc;
  }, {});
  const WARRANTY = { under: "bg-emerald-100 text-emerald-800", ending: "bg-amber-100 text-amber-900", over: "bg-base text-muted", none: "" };

  return (
    <div className="space-y-3">
      <Link href={`/property/insurance?id=${home.id}`} className="inline-flex text-sm text-accent hover:underline">{t("insurance.open")}</Link>
      {rows.length === 0 && !form && <EmptyState>{t("property.thingsEmpty")}</EmptyState>}
      {Object.entries(grouped).map(([room, items]) => (
        <section key={room}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{room}</h3>
          <ul className="mt-1 divide-y divide-edge">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.name}</span>{" "}
                  <span className="text-xs text-muted">{[r.brand, r.model, r.bought && f.day(r.bought), r.price !== null && f.money(r.price)].filter(Boolean).join(" · ")}</span>
                </span>
                {r.warranty !== "none" && r.warranty_until && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${WARRANTY[r.warranty]}`}>
                    {r.warranty === "over" ? t("property.warrantyOver") : t("property.warrantyUntil", { date: f.day(r.warranty_until) })}
                  </span>
                )}
                {r.service_months && <span className="text-xs text-muted">{t("property.serviceEvery", { n: r.service_months })}</span>}
                {r.manual_url && (
                  <a className="inline-flex items-center gap-1 text-xs text-accent hover:underline" href={r.manual_url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    {t("property.manual")}
                  </a>
                )}
                <button
                  className="text-xs text-muted hover:underline"
                  onClick={() =>
                    setForm({
                      id: r.id, name: r.name, room: r.room, brand: r.brand, model: r.model, serial: r.serial, bought: r.bought ?? "", price: r.price?.toString() ?? "",
                      warranty_until: r.warranty_until ?? "", manual_url: r.manual_url, service_months: r.service_months?.toString() ?? "", notes: r.notes ?? "", receipt_media_id: r.receipt_media_id,
                    })
                  }
                >
                  {t("vehicles.change")}
                </button>
                <button className="text-red-700" onClick={() => api.del(`/api/property/items/${r.id}`)} aria-label={t("property.removeThing", { name: r.name })}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {form ? (
        <form className="grid gap-2 rounded-lg border border-edge p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <input className="input" value={form.name} required maxLength={120} placeholder={t("property.thingNamePh")} aria-label={t("property.thingName")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" value={form.room} maxLength={60} list="rooms" placeholder={t("property.roomPh")} aria-label={t("property.room")} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          <datalist id="rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
          <input className="input" value={form.brand} maxLength={80} placeholder={t("vehicles.field.make")} aria-label={t("vehicles.field.make")} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <input className="input" value={form.model} maxLength={120} placeholder={t("vehicles.field.model")} aria-label={t("vehicles.field.model")} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <input className="input" value={form.serial} maxLength={80} placeholder={t("property.serial")} aria-label={t("property.serial")} onChange={(e) => setForm({ ...form, serial: e.target.value })} />
          <input className="input" inputMode="decimal" value={form.price} placeholder={t("property.pricePh", { currency })} aria-label={t("property.price")} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          <label className="text-sm">
            <span className="text-xs text-muted">{t("vehicles.tyreBought")}</span>
            <input className="input mt-1 w-full" type="date" value={form.bought} onChange={(e) => setForm({ ...form, bought: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("property.warrantyEnds")}</span>
            <input className="input mt-1 w-full" type="date" value={form.warranty_until} onChange={(e) => setForm({ ...form, warranty_until: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-muted">{t("property.serviceMonths")}</span>
            <input className="input mt-1 w-full" inputMode="numeric" value={form.service_months} onChange={(e) => setForm({ ...form, service_months: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <input className="input min-w-0 flex-1" type="url" value={form.manual_url} maxLength={500} placeholder={t("property.manualPh")} aria-label={t("property.manual")} onChange={(e) => setForm({ ...form, manual_url: e.target.value })} />
            {canSearch && (
              <button type="button" className="btn-ghost shrink-0 border border-edge" onClick={() => setManualSearch(true)} aria-expanded={manualSearch}>
                <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("property.findManual")}
              </button>
            )}
          </div>
          {manualSearch && (
            <div className="sm:col-span-3">
              <WebSearch
                initial={[form.brand, form.model || form.name, t("property.manualWord")].filter((x) => x.trim()).join(" ")}
                hint={t("property.manualSearchHint")}
                pickLabel={t("property.useManual")}
                onClose={() => setManualSearch(false)}
                onPick={(hit) => {
                  setForm({ ...form, manual_url: hit.url });
                  setManualSearch(false);
                }}
              />
            </div>
          )}
          <ReceiptPicker file={file} onChange={setFile} />
          <p className="text-xs text-muted sm:col-span-3">{t("property.thingsHelp")}</p>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" disabled={!form.name.trim()}>{t("vehicles.save")}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t("common.cancel")}</button>
          </div>
          {error && <p className="text-sm text-red-700 sm:col-span-3">{error}</p>}
        </form>
      ) : (
        <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setForm(blank)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("property.addThing")}
        </button>
      )}
    </div>
  );
}

function EnergyTab({ home }: { home: Property }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const energy = useApi<PropertyEnergy[]>(`/api/property/${home.id}/energy`).data ?? NONE;
  const meters = useApi<PropertyMeter[]>(`/api/property/meters?property_id=${home.id}`).data ?? NONE;
  const readings = useApi<UtilityReading[]>(`/api/property/utility-readings?property_id=${home.id}`).data ?? NONE;
  const [form, setForm] = useState({ kind: "electricity", reading_date: today(), value: "" });
  const [sensor, setSensor] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    setSensor(Object.fromEntries(meters.map((m) => [m.kind, m.ha_entity ?? ""])));
  }, [meters]);
  const unitOf = (kind: string) => meters.find((m) => m.kind === kind)?.unit ?? METERS.find((m) => m.kind === kind)?.unit ?? "";
  const month = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString(dateLocale, { month: "short" });

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <div className="space-y-4">
      {energy.length === 0 && <EmptyState>{t("property.energyEmpty")}</EmptyState>}
      {energy.map((e) => {
        const last12 = e.months.slice(-12);
        const top = Math.max(1, ...last12.map((m) => m.use));
        return (
          <section key={e.kind} className="rounded-lg border border-edge p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{t(`property.meter.${e.kind}` as TranslationKey)}</h3>
              <p className="text-sm">
                {t("property.energyThisYear", { amount: `${e.this_year.toLocaleString(dateLocale)} ${e.unit}` })}
                {e.last_year_to_date > 0 && <span className="text-muted"> · {t("property.lastYearSame", { amount: `${e.last_year_to_date.toLocaleString(dateLocale)} ${e.unit}` })}</span>}
              </p>
            </div>
            {last12.length > 0 && (
              <div className="mt-3 flex h-28 items-end gap-1" role="img" aria-label={t("property.perMonth")}>
                {last12.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(2, (m.use / top) * 88)}px` }} title={`${m.use.toLocaleString(dateLocale)} ${e.unit}`} />
                    <span className="text-[10px] text-muted">{month(m.month)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-edge p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const value = num(form.value);
          if (value === null) return;
          run(async () => {
            await api.post("/api/property/utility-readings", { property_id: home.id, kind: form.kind, reading_date: form.reading_date, value, unit: unitOf(form.kind) });
            setForm({ ...form, value: "" });
          });
        }}
      >
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.meterKind")}</span>
          <select className="input mt-1 block" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {METERS.map((m) => <option key={m.kind} value={m.kind}>{t(`property.meter.${m.kind}` as TranslationKey)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.date")}</span>
          <input className="input mt-1 block" type="date" value={form.reading_date} onChange={(e) => setForm({ ...form, reading_date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.meterReading", { unit: unitOf(form.kind) })}</span>
          <input className="input mt-1 block w-36" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        </label>
        <button className="btn-primary" disabled={!form.value.trim()}>{t("vehicles.addReading")}</button>
        <p className="w-full text-xs text-muted">{t("property.meterHelp")}</p>
      </form>

      {me.smarthome_available && (
        <section className="space-y-2 rounded-lg border border-edge p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("property.fromHa")}</h3>
          {METERS.map((m) => {
            const meter = meters.find((x) => x.kind === m.kind);
            return (
              <div key={m.kind} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24">{t(`property.meter.${m.kind}` as TranslationKey)}</span>
                <input className="input min-w-0 flex-1 font-mono text-xs" value={sensor[m.kind] ?? ""} placeholder={`sensor.${m.kind}_total`} aria-label={t("property.haSensorFor", { kind: t(`property.meter.${m.kind}` as TranslationKey) })} onChange={(e) => setSensor({ ...sensor, [m.kind]: e.target.value })} />
                <button
                  className="btn-ghost border border-edge px-3 py-1"
                  onClick={() => run(() => api.post("/api/property/meters", { property_id: home.id, kind: m.kind, unit: meter?.unit ?? m.unit, ha_entity: (sensor[m.kind] ?? "").trim() || null }))}
                >
                  {t("vehicles.save")}
                </button>
                {meter?.ha_entity && (
                  <button className="btn-ghost border border-edge px-3 py-1" onClick={() => run(() => api.post(`/api/property/meters/${meter.id}/read`, {}))}>
                    {t("vehicles.readNow")}
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted">{t("property.haHelp")}</p>
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {readings.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">{t("property.readings", { n: readings.length })}</summary>
          <ul className="mt-2 divide-y divide-edge text-sm">
            {readings.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-1">
                <span className="w-28 text-xs text-muted">{new Date(`${r.reading_date}T12:00:00`).toLocaleDateString(dateLocale)}</span>
                <span className="w-24">{t(`property.meter.${r.kind}` as TranslationKey)}</span>
                <span className="flex-1 tabular-nums">{Number(r.value).toLocaleString(dateLocale)} {r.unit}</span>
                <button className="text-red-700" onClick={() => run(() => api.del(`/api/property/utility-readings/${r.id}`))} aria-label={t("vehicles.removeReading")}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DocumentsTab({ home }: { home: Property }) {
  const { t, dateLocale } = useI18n();
  const linked = useApi<VehicleDocument[]>(`/api/property/${home.id}/documents`).data ?? NONE;
  const all = useApi<VehicleDocument[]>("/api/documents").data ?? NONE;
  const [pick, setPick] = useState("");
  const others = all.filter((d) => !linked.some((l) => l.id === d.id));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t("property.documentsHelp")}</p>
      {linked.length === 0 ? (
        <EmptyState>{t("vehicles.documentsEmpty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-edge text-sm">
          {linked.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <FileText className="h-4 w-4 text-muted" aria-hidden />
              <Link href="/documents" className="flex-1 font-semibold hover:underline">{d.title}</Link>
              {d.expiry_date && <span className="text-xs text-muted">{t("vehicles.docExpires", { date: new Date(`${d.expiry_date}T12:00:00`).toLocaleDateString(dateLocale) })}</span>}
              <button className="text-xs text-muted hover:underline" onClick={() => api.del(`/api/property/${home.id}/documents/${d.id}`)}>
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
          <button className="btn-ghost border border-edge" disabled={!pick} onClick={() => api.put<VehicleDocument[]>(`/api/property/${home.id}/documents/${pick}`, {}).then(() => setPick(""))}>
            {t("vehicles.link")}
          </button>
        </div>
      )}
      <Link href="/documents" className="text-sm text-accent hover:underline">{t("vehicles.toDocuments")}</Link>
    </div>
  );
}

function SettingsTab({ home, currency, onDeleted }: { home: Property; currency: string; onDeleted: () => void }) {
  const { t } = useI18n();
  const f = useMoney(currency);
  const [form, setForm] = useState({
    name: home.name, kind: home.kind, dwelling: home.dwelling ?? "villa", address: home.address ?? "", built_year: home.built_year?.toString() ?? "",
    area_m2: home.area_m2?.toString() ?? "", purchase_date: home.purchase_date ?? "", purchase_price: home.purchase_price?.toString() ?? "", notes: home.notes ?? "",
  });
  const costs = useApi<PropertyRecurringCost[]>(`/api/property/recurring-costs?property_id=${home.id}`).data ?? NONE;
  const [cost, setCost] = useState({ kind: "", amount: "", period: "monthly" as PropertyRecurringCost["period"] });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };
  return (
    <div className="space-y-5">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          api
            .patch(`/api/property/properties/${home.id}`, {
              name: form.name.trim(), kind: form.kind, dwelling: form.dwelling, address: form.address.trim() || null, built_year: num(form.built_year),
              area_m2: num(form.area_m2), purchase_date: form.purchase_date || null, purchase_price: num(form.purchase_price), notes: form.notes.trim() || null,
            })
            .then(() => setSaved(true))
            .catch((err) => setError(err instanceof Error ? err.message : t("common.error")));
        }}
      >
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.name")}</span>
          <input className="input mt-1 w-full" value={form.name} required onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.dwellingLabel")}</span>
          <select className="input mt-1 w-full" value={form.dwelling} onChange={(e) => set({ dwelling: e.target.value })}>
            {DWELLING_ORDER.map((d) => <option key={d} value={d}>{dwellingInfo(d).icon} {t(dwellingLabel(d))}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.use")}</span>
          <select className="input mt-1 w-full" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {["primary", "secondary", "cabin", "rental", "other"].map((k) => <option key={k} value={k}>{t(`property.kind.${k}` as TranslationKey)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.address")}</span>
          <AddressInput className="input mt-1 w-full" value={form.address} onChange={(address) => set({ address })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.builtYear")}</span>
          <input className="input mt-1 w-full" inputMode="numeric" value={form.built_year} onChange={(e) => set({ built_year: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("property.area")}</span>
          <input className="input mt-1 w-full" inputMode="decimal" value={form.area_m2} onChange={(e) => set({ area_m2: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.purchaseDate")}</span>
          <input className="input mt-1 w-full" type="date" value={form.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">{t("vehicles.field.purchasePrice")}</span>
          <input className="input mt-1 w-full" inputMode="decimal" value={form.purchase_price} onChange={(e) => set({ purchase_price: e.target.value })} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-xs text-muted">{t("vehicles.field.notes")}</span>
          <textarea className="input mt-1 w-full" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="btn-primary">{t("vehicles.save")}</button>
          {saved && <span className="text-sm text-muted">{t("vehicles.saved")}</span>}
        </div>
        {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </form>

      <section className="space-y-2 rounded-lg border border-edge p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("property.recurring")}</h3>
        <ul className="divide-y divide-edge text-sm">
          {costs.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{c.kind}</span>
              <span className="tabular-nums">{f.money(c.amount)} / {t(`property.period.${c.period}` as TranslationKey)}</span>
              <button className="text-red-700" onClick={() => api.del(`/api/property/recurring-costs/${c.id}`)} aria-label={t("property.removeRecurring", { name: c.kind })}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = num(cost.amount);
            if (!cost.kind.trim() || !amount) return;
            api.post("/api/property/recurring-costs", { property_id: home.id, kind: cost.kind.trim(), amount, period: cost.period }).then(() => {
              setCost({ kind: "", amount: "", period: "monthly" });
            });
          }}
        >
          <input className="input min-w-0 flex-1" value={cost.kind} maxLength={30} placeholder={t("property.recurringPh")} aria-label={t("property.recurringName")} onChange={(e) => setCost({ ...cost, kind: e.target.value })} />
          <input className="input w-28" inputMode="decimal" value={cost.amount} placeholder={currency} aria-label={t("property.amountPh")} onChange={(e) => setCost({ ...cost, amount: e.target.value })} />
          <select className="input w-auto" value={cost.period} aria-label={t("property.periodLabel")} onChange={(e) => setCost({ ...cost, period: e.target.value as PropertyRecurringCost["period"] })}>
            {(["monthly", "quarterly", "yearly"] as const).map((p) => <option key={p} value={p}>{t(`property.period.${p}` as TranslationKey)}</option>)}
          </select>
          <button className="btn-ghost border border-edge">{t("common.add")}</button>
        </form>
      </section>

      <div className="flex flex-wrap gap-2">
        <a className="btn-ghost inline-flex items-center gap-1 border border-edge" href={`/api/property/export?property_id=${home.id}`}>
          <Download className="h-4 w-4" aria-hidden />
          {t("property.exportZip")}
        </a>
        <button className="btn-ghost border border-red-300 text-red-700" onClick={() => { if (window.confirm(t("property.deleteConfirm", { name: home.name }))) api.del(`/api/property/properties/${home.id}`).then(onDeleted); }}>
          {t("property.delete")}
        </button>
      </div>
    </div>
  );
}

type Tab = "upkeep" | "costs" | "projects" | "things" | "energy" | "documents" | "settings";

export default function PropertyPage() {
  const { t } = useI18n();
  const me = useMe();
  const [chosenId, setActiveId] = useState("");
  const [tab, setTab] = useState<Tab>("upkeep");
  const [adding, setAdding] = useState(false);
  const [newHome, setNewHome] = useState({ name: "", dwelling: "villa", address: "" });
  const [error, setError] = useState("");

  // From the cache: any change to a home (here or elsewhere in the family) refreshes it.
  const overview = useApi<HomeCard[]>("/api/property/overview");
  const cards = overview.data ?? null;
  // The home chosen – the first one until then, or when the chosen one is gone.
  const activeId = cards?.some((c) => c.property.id === chosenId) ? chosenId : (cards?.[0]?.property.id ?? "");
  const projects = useApi<PropertyProject[]>(activeId ? `/api/property/projects?property_id=${activeId}` : null).data ?? NONE;
  useEffect(() => {
    if (overview.error) setError(overview.error.message);
  }, [overview.error]);

  const active = cards?.find((c) => c.property.id === activeId) ?? null;

  async function create() {
    setError("");
    try {
      const row = await api.post<Property>("/api/property/properties", { name: newHome.name.trim(), dwelling: newHome.dwelling, address: newHome.address.trim() || null, kind: "primary" });
      setNewHome({ name: "", dwelling: "villa", address: "" });
      setAdding(false);
      setActiveId(row.id);
      setTab("upkeep");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "upkeep", label: t("property.tab.upkeep"), show: true },
    { id: "costs", label: t("vehicles.tab.costs"), show: true },
    { id: "projects", label: t("property.projects"), show: true },
    { id: "things", label: t("property.things"), show: true },
    { id: "energy", label: t("property.tab.energy"), show: true },
    { id: "documents", label: t("vehicles.tab.documents"), show: me.apps.includes("documents") },
    { id: "settings", label: t("vehicles.tab.settings"), show: true },
  ];
  const shown = tabs.filter((x) => x.show);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <PageTitle title={t("property.title")} />
        <button className="btn-primary inline-flex items-center gap-1" onClick={() => setAdding((a) => !a)}>
          {adding ? t("common.cancel") : <><Plus className="h-4 w-4" aria-hidden />{t("property.addProperty")}</>}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{t("property.intro")}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {adding && (
        <form className="card mt-4 grid gap-2 p-4 sm:grid-cols-[1fr_12rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input className="input" value={newHome.name} required maxLength={200} placeholder={t("property.propertyNamePh")} aria-label={t("vehicles.field.name")} onChange={(e) => setNewHome({ ...newHome, name: e.target.value })} />
          <select className="input" value={newHome.dwelling} aria-label={t("property.dwellingLabel")} onChange={(e) => setNewHome({ ...newHome, dwelling: e.target.value })}>
            {DWELLING_ORDER.map((d) => <option key={d} value={d}>{dwellingInfo(d).icon} {t(dwellingLabel(d))}</option>)}
          </select>
          <AddressInput value={newHome.address} placeholder={t("property.address")} aria-label={t("property.address")} showMap={false} onChange={(address) => setNewHome({ ...newHome, address })} />
          <button className="btn-primary" disabled={!newHome.name.trim()}>{t("property.addProperty")}</button>
        </form>
      )}

      {cards && cards.length === 0 && !adding && (
        <div className="mt-4">
          <EmptyState action={<button className="btn-primary" onClick={() => setAdding(true)}>{t("property.addProperty")}</button>}>{t("property.empty")}</EmptyState>
        </div>
      )}

      {cards && cards.length > 0 && (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {cards.map((card) => <OverviewCard key={card.property.id} card={card} active={card.property.id === activeId} onOpen={() => setActiveId(card.property.id)} />)}
        </ul>
      )}

      {active && (
        <section className="card mt-5 p-4" aria-label={active.property.name}>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Home className="h-5 w-5 text-accent" aria-hidden />
            {active.property.name}
          </h2>
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-edge p-1" role="tablist">
            {shown.map((x) => (
              <button key={x.id} role="tab" aria-selected={tab === x.id} className={`rounded px-3 py-1.5 text-sm ${tab === x.id ? "bg-base font-semibold" : "text-muted"}`} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          {tab === "upkeep" && <UpkeepTab home={active.property} reminders={active.reminders} currency={active.currency} />}
          {tab === "costs" && <CostsTab home={active.property} currency={active.currency} projects={projects} />}
          {tab === "projects" && <ProjectsTab home={active.property} currency={active.currency} projects={projects} />}
          {tab === "things" && <ThingsTab home={active.property} currency={active.currency} />}
          {tab === "energy" && <EnergyTab home={active.property} />}
          {tab === "documents" && <DocumentsTab home={active.property} />}
          {tab === "settings" && <SettingsTab key={active.property.id} home={active.property} currency={active.currency} onDeleted={() => setActiveId("")} />}
        </section>
      )}
    </>
  );
}
