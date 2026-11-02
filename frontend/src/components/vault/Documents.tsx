"use client";

// The vault's documents (2.8.1, before that under Safety): passports, ID cards, insurance, warranties, vaccinations … with a reminder before
// they expire. Numbers are masked until shown; numbers and files are encrypted on the server and
// never saved on this device (the list is kept in memory only, see lib/queryClient.ts).
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Eye, EyeOff, FileText, Link2, Lock, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { api, DocumentKind, FamilyDocument, Member } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";

const KINDS: DocumentKind[] = ["passport", "id_card", "driving_licence", "insurance", "warranty", "contract", "vaccination", "health", "other"];
const DEFAULT_REMIND: Partial<Record<DocumentKind, number>> = { passport: 90, id_card: 60, driving_licence: 60, vaccination: 14 };
const REMIND_CHOICES = [7, 14, 30, 60, 90, 180];

type Draft = {
  id?: string;
  user_id: string;
  kind: DocumentKind;
  title: string;
  number: string;
  issued_date: string;
  expiry_date: string;
  remind_days: number;
  private: boolean;
  notes: string;
};

const emptyDraft = (userId: string): Draft => ({
  user_id: userId,
  kind: "passport",
  title: "",
  number: "",
  issued_date: "",
  expiry_date: "",
  remind_days: 90,
  private: false,
  notes: "",
});

export type DocumentFileView = { doc: FamilyDocument; file: FamilyDocument["files"][number] };

/** The register of the family's documents; in the vault it is the Documents view. */
export default function Documents({ embedded = false, onOpenFile, onShareFile }: { embedded?: boolean; onOpenFile?: (view: DocumentFileView) => void; onShareFile?: (view: DocumentFileView) => void }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [docs, setDocs] = useState<FamilyDocument[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.live<FamilyDocument[]>("/api/documents", setDocs).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);
  useEffect(load, [load]);
  useLive(["documents"], load);
  useEffect(() => {
    api.live<Member[]>("/api/family/members", setMembers).catch(() => {});
  }, []);

  const kindLabel = (kind: DocumentKind) => t(`documents.kind.${kind}` as TranslationKey);
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  async function save() {
    if (!draft) return;
    setError("");
    const body = {
      user_id: draft.user_id || null,
      kind: draft.kind,
      title: draft.title.trim() || kindLabel(draft.kind),
      // Leave the number alone when editing and nothing was typed.
      number: draft.id && !draft.number ? null : draft.number,
      issued_date: draft.issued_date || null,
      expiry_date: draft.expiry_date || null,
      remind_days: draft.remind_days,
      private: draft.private,
      notes: draft.notes || null,
    };
    try {
      if (draft.id) await api.put(`/api/documents/${draft.id}`, body);
      else await api.post("/api/documents", body);
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function reveal(doc: FamilyDocument) {
    if (shown[doc.id]) {
      const next = { ...shown };
      delete next[doc.id];
      return setShown(next);
    }
    // Straight from the server, not through the app's cache.
    const resp = await fetch(`/api/documents/${doc.id}/number`, { credentials: "same-origin", cache: "no-store" });
    if (resp.ok) setShown({ ...shown, [doc.id]: (await resp.json()).number });
  }

  async function upload(doc: FamilyDocument, file: File) {
    setError("");
    const data = new FormData();
    data.append("file", file);
    const resp = await fetch(`/api/documents/${doc.id}/files`, { method: "POST", body: data, credentials: "same-origin" });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      setError(typeof body.detail === "string" ? body.detail : t("common.error"));
    }
    load();
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  function edit(doc: FamilyDocument) {
    setDraft({
      id: doc.id,
      user_id: doc.user_id ?? "",
      kind: doc.kind,
      title: doc.title,
      number: "",
      issued_date: doc.issued_date ?? "",
      expiry_date: doc.expiry_date ?? "",
      remind_days: doc.remind_days,
      private: doc.private,
      notes: doc.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Household first, then each member in the family's order.
  const owners: { id: string | null; name: string }[] = [
    { id: null, name: t("documents.household") },
    ...members.map((m) => ({ id: m.id, name: m.display_name })),
  ];
  const forWhom = adult ? owners : owners.filter((o) => o.id === me.id);

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${embedded ? "" : "justify-between"}`}>
        {!embedded && (
          <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
            <FileText className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
            {t("documents.title")}
          </h1>
        )}
        {!draft && (
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setDraft(emptyDraft(adult ? "" : me.id))}>
            <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            {t("documents.add")}
          </button>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("documents.privacy")}
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {draft && (
        <section className="card mt-4 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{draft.id ? t("documents.edit") : t("documents.add")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              {t("documents.whose")}
              <select className="input mt-1 w-full" value={draft.user_id} onChange={(e) => setDraft({ ...draft, user_id: e.target.value })}>
                {forWhom.map((o) => <option key={o.id ?? "household"} value={o.id ?? ""}>{o.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              {t("documents.kindLabel")}
              <select
                className="input mt-1 w-full"
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as DocumentKind;
                  setDraft({ ...draft, kind, remind_days: draft.id ? draft.remind_days : DEFAULT_REMIND[kind] ?? 30 });
                }}
              >
                {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted">
              {t("documents.name")}
              <input className="input mt-1 w-full" value={draft.title} maxLength={120} placeholder={kindLabel(draft.kind)} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="text-xs text-muted">
              {t("documents.number")}
              <input
                className="input mt-1 w-full"
                value={draft.number}
                maxLength={100}
                autoComplete="off"
                placeholder={draft.id ? t("documents.numberKeep") : ""}
                onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              />
            </label>
            <label className="text-xs text-muted">
              {t("documents.issued")}
              <input className="input mt-1 w-full" type="date" value={draft.issued_date} onChange={(e) => setDraft({ ...draft, issued_date: e.target.value })} />
            </label>
            <label className="text-xs text-muted">
              {draft.kind === "vaccination" ? t("documents.nextDose") : t("documents.expires")}
              <input className="input mt-1 w-full" type="date" value={draft.expiry_date} onChange={(e) => setDraft({ ...draft, expiry_date: e.target.value })} />
            </label>
            <label className="text-xs text-muted">
              {t("documents.remind")}
              <select className="input mt-1 w-full" value={draft.remind_days} onChange={(e) => setDraft({ ...draft, remind_days: Number(e.target.value) })}>
                {Array.from(new Set([...REMIND_CHOICES, draft.remind_days])).sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>{t("documents.daysBefore", { n })}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={draft.private} onChange={(e) => setDraft({ ...draft, private: e.target.checked })} />
              {t("documents.private")}
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              {t("documents.notes")}
              <textarea className="input mt-1 min-h-16 w-full" value={draft.notes} maxLength={5000} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={save}>{t("profile.save")}</button>
            <button className="btn-ghost" onClick={() => setDraft(null)}>{t("common.cancel")}</button>
          </div>
        </section>
      )}

      {docs === null ? (
        <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>
      ) : docs.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t("documents.empty")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {owners
            .map((o) => ({ ...o, docs: docs.filter((d) => (d.user_id ?? null) === o.id) }))
            .filter((o) => o.docs.length > 0)
            .map((o) => (
              <section key={o.id ?? "household"} className="card p-5">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{o.name}</h2>
                <ul className="divide-y divide-edge">
                  {o.docs.map((doc) => (
                    <li key={doc.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold">{doc.title}</span>
                        <span className="text-xs text-muted">{kindLabel(doc.kind)}</span>
                        {doc.private && <Lock className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-label={t("documents.private")} />}
                        {doc.expiry_date && (
                          <span
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                              doc.status === "expired" ? "bg-red-100 font-semibold text-red-800" : doc.status === "soon" ? "bg-amber-100 font-semibold text-amber-900" : "text-muted"
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                            {doc.status === "expired"
                              ? t("documents.expired", { date: day(doc.expiry_date) })
                              : doc.kind === "vaccination"
                                ? t("documents.nextDoseOn", { date: day(doc.expiry_date) })
                                : t("documents.expiresOn", { date: day(doc.expiry_date) })}
                          </span>
                        )}
                        {doc.can_edit && (
                          <span className="ml-auto flex gap-1">
                            <button className="btn-ghost px-2 py-1" onClick={() => edit(doc)} aria-label={t("documents.edit")}>
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </button>
                            <button
                              className="btn-ghost px-2 py-1 text-red-700"
                              onClick={() => window.confirm(t("documents.confirmDelete", { title: doc.title })) && run(() => api.del(`/api/documents/${doc.id}`))}
                              aria-label={t("common.remove")}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            </button>
                          </span>
                        )}
                      </div>
                      {doc.number_masked && (
                        <p className="mt-1 flex items-center gap-2 text-sm">
                          <span className="font-mono">{shown[doc.id] ?? doc.number_masked}</span>
                          <button className="flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => reveal(doc)}>
                            {shown[doc.id] ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                            {shown[doc.id] ? t("documents.hide") : t("documents.show")}
                          </button>
                        </p>
                      )}
                      {doc.notes && <p className="mt-1 whitespace-pre-line text-sm text-muted">{doc.notes}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {doc.files.map((f) => (
                          <span key={f.id} className="flex items-center gap-1 rounded-full border border-edge px-2 py-0.5 text-xs">
                            {onOpenFile ? (
                              <button className="hover:underline" onClick={() => onOpenFile({ doc, file: f })}>
                                {f.filename}
                              </button>
                            ) : (
                              <a href={`/api/documents/${doc.id}/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {f.filename}
                              </a>
                            )}
                            {onShareFile && (
                              <button className="text-muted hover:text-accent" onClick={() => onShareFile({ doc, file: f })} aria-label={t("vault.shareTitle", { name: f.filename })} title={t("vault.share")}>
                                <Link2 className="h-3 w-3" aria-hidden />
                              </button>
                            )}
                            {doc.can_edit && (
                              <button className="text-muted hover:text-red-700" onClick={() => run(() => api.del(`/api/documents/${doc.id}/files/${f.id}`))} aria-label={t("common.remove")}>
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                        {doc.can_edit && (
                          <label className="flex cursor-pointer items-center gap-1 text-xs text-accent hover:underline">
                            <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                            {t("documents.attach")}
                            <input
                              type="file"
                              className="sr-only"
                              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text,application/vnd.oasis.opendocument.spreadsheet,application/vnd.oasis.opendocument.presentation,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) upload(doc, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
