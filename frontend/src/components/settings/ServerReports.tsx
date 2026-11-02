"use client";

// Server settings → Reports (3.1.0): the families' reports of problems and wishes, kept on this
// server. The server admin reads them, sets their status (the reporter is told, with a note if one
// is written) and takes the chosen ones to the project's public repository: the export is an
// anonymous text – what and where, never who or which family – and GitHub's form filled in with it.
import { useEffect, useState } from "react";
import { Bug, Check, Copy, ExternalLink, Lightbulb, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Status = "new" | "planned" | "done" | "declined";
type Report = {
  id: string;
  type: "bug" | "idea";
  title: string;
  description: string;
  reporter_name: string;
  reporter_role: string;
  family_name: string;
  created_at: string;
  has_screenshot: boolean;
  issue_number: number;
  status: Status;
  admin_note: string | null;
  page: string | null;
  browser: string;
  viewport: string | null;
  exported_at: string | null;
  issue_url: string | null;
};
type Export = { title: string; body: string; url: string; body_in_url: boolean };

const STATUSES: Status[] = ["new", "planned", "done", "declined"];
export const STATUS_TONE: Record<Status, string> = {
  new: "bg-accent-soft text-ink",
  planned: "bg-sky-100 text-sky-900",
  done: "bg-green-100 text-green-800",
  declined: "bg-edge text-muted",
};

export default function ServerReports() {
  const { t, dateLocale } = useI18n();
  // From the cache: a new report (a live event to the server admin) or a change here refreshes it.
  const reportsQuery = useApi<Report[]>("/api/feedback/all");
  const reports = reportsQuery.data ?? null;
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [exported, setExported] = useState<Export | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (reportsQuery.error) setError(reportsQuery.error.message);
  }, [reportsQuery.error]);

  async function change(report: Report, body: { status?: Status; admin_note?: string }) {
    setError("");
    setApiData<Report[]>("/api/feedback/all", (all) => all?.map((r) => (r.id === report.id ? { ...r, ...body } : r)));
    try {
      await api.patch(`/api/feedback/${report.id}`, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function exportChosen() {
    setError("");
    try {
      const out = await api.post<Export>("/api/feedback/export", { ids: [...chosen] });
      setExported(out);
      setCopied(false);
      await navigator.clipboard?.writeText(out.body).then(() => setCopied(true)).catch(() => {});
      setChosen(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!reports) return <p className="text-sm text-muted">{error || t("common.loading")}</p>;
  const shown = showAll ? reports : reports.filter((r) => r.status === "new" || r.status === "planned");
  const toggle = (id: string) => setChosen((all) => {
    const next = new Set(all);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const when = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  const role = (r: string) => t(r === "admin" ? "settings.role.admin" : r === "child" ? "settings.role.child" : "settings.role.adult");

  return (
    <section className="card p-5" aria-label={t("server.tab.reports")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("server.tab.reports")}</h2>
      <p className="mb-3 text-xs text-muted">{t("reports.intro")}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {t("reports.showAll")}
        </label>
        <button className="btn-primary ml-auto inline-flex items-center gap-1.5" disabled={chosen.size === 0} onClick={exportChosen}>
          <Upload className="h-4 w-4" aria-hidden />
          {t("reports.export", { n: chosen.size })}
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{showAll ? t("reports.none") : t("reports.noneOpen")}</p>
      ) : (
        <ul className="divide-y divide-edge">
          {shown.map((r) => {
            const Icon = r.type === "bug" ? Bug : Lightbulb;
            const expanded = open === r.id;
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary-700" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} aria-label={t("reports.choose", { title: r.title })} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{r.title}</span>
                    </span>
                    <span className="block text-xs text-muted">
                      #{r.issue_number} · {r.family_name} · {r.reporter_name} ({role(r.reporter_role)}) · {when(r.created_at)}
                      {r.exported_at ? ` · ${t("reports.exported")}` : ""}
                    </span>
                  </button>
                  <select className={`input !w-auto py-1 text-xs font-semibold ${STATUS_TONE[r.status]}`} value={r.status} onChange={(e) => change(r, { status: e.target.value as Status })} aria-label={t("reports.status", { title: r.title })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`feedback.status.${s}` as TranslationKey)}</option>)}
                  </select>
                </div>
                {expanded && (
                  <div className="ml-7 mt-3 space-y-3 rounded-lg border border-edge bg-base p-3 text-sm">
                    <p className="whitespace-pre-line">{r.description}</p>
                    <p className="text-xs text-muted">
                      {[r.page && `${t("reports.page")}: ${r.page}`, r.browser, r.viewport].filter(Boolean).join(" · ")}
                    </p>
                    {r.has_screenshot && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/feedback/${r.id}/screenshot`} alt={t("feedback.screenshotChosen")} className="max-h-72 rounded-lg border border-edge" />
                    )}
                    {r.issue_url && (
                      <a href={r.issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:underline">
                        GitHub <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    <label className="block">
                      <span className="label">{t("reports.note")}</span>
                      <textarea className="input min-h-16" maxLength={2000} value={notes[r.id] ?? r.admin_note ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder={t("reports.notePh")} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-ghost border border-edge text-sm" disabled={(notes[r.id] ?? r.admin_note ?? "") === (r.admin_note ?? "")} onClick={() => change(r, { admin_note: notes[r.id] ?? "" })}>
                        {t("reports.saveNote")}
                      </button>
                      <button
                        className="ml-auto inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                        onClick={() => confirm(t("reports.deleteConfirm", { title: r.title })) && api.del(`/api/feedback/${r.id}`)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {t("common.remove")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {exported && (
        <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t("reports.exportTitle")}>
          <div className="m-auto w-full max-w-2xl space-y-3 rounded-2xl bg-surface p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold">{t("reports.exportTitle")}</h2>
              <button className="btn-ghost px-2" onClick={() => setExported(null)} aria-label={t("common.close")}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <p className="text-sm text-muted">{exported.body_in_url ? t("reports.exportHint") : t("reports.exportPaste")}</p>
            <p className="text-sm font-semibold">{exported.title}</p>
            <textarea className="input min-h-64 font-mono text-xs" readOnly value={exported.body} aria-label={t("reports.exportText")} onFocus={(e) => e.target.select()} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost inline-flex items-center gap-1.5 border border-edge" onClick={() => navigator.clipboard?.writeText(exported.body).then(() => setCopied(true))}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? t("reports.copied") : t("reports.copy")}
              </button>
              <a className="btn-primary ml-auto inline-flex items-center gap-1.5" href={exported.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("reports.openGitHub")}
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
