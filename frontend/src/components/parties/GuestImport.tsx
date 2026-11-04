"use client";

// Bringing a guest list in (3.4.0): an Excel sheet, a CSV or a text file, or pasted names. The file is
// read here in the browser; the guests are seen and the columns can be changed before they're added.
import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { COLUMN_KEYS, ColumnKey, Columns, guessColumns, parseText, toGuests } from "@/lib/guestImport";

const MAX_FILE = 5_000_000;

export default function GuestImport({ path, onDone }: { path: string; onDone: (detail: unknown) => void }) {
  const { t } = useI18n();
  const T = (k: string, v?: Record<string, string | number>) => t(k as TranslationKey, v);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [columns, setColumns] = useState<Columns>({});
  const [header, setHeader] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const parsed = useMemo(() => (rows ? toGuests(rows, columns, header) : null), [rows, columns, header]);

  const take = (found: string[][]) => {
    if (!found.length) {
      setError(t("guestImport.empty"));
      setRows(null);
      return;
    }
    const guess = guessColumns(found);
    setRows(found);
    setColumns(guess.columns);
    setHeader(guess.header);
    setError("");
    setNote("");
  };
  const open = async (file: File) => {
    setError("");
    if (file.size > MAX_FILE) {
      setError(t("guestImport.tooBig"));
      return;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".xls")) {
      setError(t("guestImport.oldExcel"));
      return;
    }
    try {
      if (name.endsWith(".xlsx")) {
        const { readWorkbook } = await import("@/lib/officePreview");
        const sheet = (await readWorkbook(await file.arrayBuffer())).find((s) => s.rows.some((r) => r.some(Boolean)));
        take((sheet?.rows ?? []).map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean)));
      } else {
        take(parseText(await file.text()));
      }
    } catch {
      setError(t("guestImport.unreadable"));
    }
  };
  const add = async () => {
    if (!parsed) return;
    setError("");
    try {
      const out = await api.post<{ added: number; skipped: number; party: unknown }>(`${path}/guests/import`, { guests: parsed.guests.map((g) => ({ ...g, email: g.email || null })) });
      onDone(out.party);
      setNote(t("guestImport.done", { added: out.added, skipped: out.skipped }));
      setRows(null);
      setPasted("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  const width = rows ? Math.max(...rows.map((r) => r.length)) : 0;
  const columnName = (i: number) => (header && rows?.[0][i]) || t("guestImport.columnN", { n: i + 1 });

  return (
    <section className="card space-y-2 p-5" aria-label={t("guestImport.title")}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("guestImport.title")}</h2>
      <p className="text-xs text-muted">{t("guestImport.help")}</p>
      <label className="btn-ghost flex w-fit cursor-pointer items-center gap-1.5 border border-edge text-sm">
        <Upload className="h-4 w-4" aria-hidden />{t("guestImport.file")}
        <input type="file" accept=".xlsx,.xls,.csv,.txt,.tsv,text/csv,text/plain" className="sr-only" aria-label={t("guestImport.file")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.target.value = ""; }} />
      </label>
      <label className="block"><span className="label">{t("guestImport.paste")}</span><textarea className="input min-h-16 text-sm" value={pasted} placeholder={t("guestImport.pasteHint")} onChange={(e) => setPasted(e.target.value)} /></label>
      <button type="button" className="btn-ghost border border-edge text-sm" disabled={!pasted.trim()} onClick={() => take(parseText(pasted))}>{t("guestImport.read")}</button>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {note && <p className="text-sm font-semibold text-accent" role="status">{note}</p>}
      {rows && parsed && (
        <div className="space-y-2 rounded-lg bg-accent-soft p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {COLUMN_KEYS.map((k: ColumnKey) => (
              <label key={k}><span className="label">{T(`guestImport.col.${k}`)}</span>
                <select className="input py-1 text-sm" value={columns[k] ?? ""} onChange={(e) => setColumns({ ...columns, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">{t("guestImport.noColumn")}</option>
                  {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{columnName(i)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary-700" checked={header} onChange={(e) => setHeader(e.target.checked)} />{t("guestImport.header")}</label>
          <p className="text-sm font-semibold">{t("guestImport.found", { n: parsed.guests.length })}</p>
          <ul className="max-h-40 divide-y divide-edge overflow-auto text-xs">
            {parsed.guests.slice(0, 50).map((g, i) => <li key={i} className="py-1"><span className="font-semibold">{`${g.first_name} ${g.last_name}`.trim()}</span>{g.email && ` · ${g.email}`}{g.allergies && ` · ${g.allergies}`}</li>)}
          </ul>
          {parsed.guests.length > 50 && <p className="text-xs">{t("guestImport.more", { n: parsed.guests.length - 50 })}</p>}
          {parsed.duplicates > 0 && <p className="text-xs">{t("guestImport.duplicates", { n: parsed.duplicates })}</p>}
          {parsed.badEmails > 0 && <p className="text-xs">{t("guestImport.badEmails", { n: parsed.badEmails })}</p>}
          {parsed.tooMany > 0 && <p className="text-xs">{t("guestImport.tooMany", { n: parsed.tooMany })}</p>}
          <button type="button" className="btn-primary" disabled={!parsed.guests.length} onClick={() => { void add(); }}>{t("guestImport.add", { n: parsed.guests.length })}</button>
        </div>
      )}
    </section>
  );
}
