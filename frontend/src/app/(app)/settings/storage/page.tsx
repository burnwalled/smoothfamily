"use client";

// Family admin → Storage & backup: where data lives, backups of the server (server admin), the
// family's data export, and moving the configuration to another installation.
import { useState } from "react";
import { Download, FileArchive, TriangleAlert } from "lucide-react";
import { api, ConfigImportResult } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function StorageSettingsPage() {
  const { t } = useI18n();
  const [importResult, setImportResult] = useState<ConfigImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);


  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportResult(null);
    setImporting(true);
    try {
      const json = JSON.parse(await file.text());
      setImportResult(await api.post<ConfigImportResult>("/api/admin/import", json));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <section className="card mt-4 p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
          <FileArchive className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("backups.exportTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("backups.exportDesc")}</p>
        <a href="/api/admin/export/family" download className="btn-primary text-sm">
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("backups.exportButton")}
        </a>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.backup")}</h2>
        <p className="text-xs text-muted mb-3">{t("settings.backupDesc")}</p>
        <p className="mb-3 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {t("settings.backupWarning")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/admin/export" download="smooth-family-config.json" className="btn-primary text-sm">
            {t("settings.export")}
          </a>
          <label className={`btn-ghost text-sm cursor-pointer ${importing ? "opacity-50 pointer-events-none" : ""}`}>
            {importing ? t("settings.importing") : t("settings.import")}
            <input type="file" accept=".json,application/json" className="sr-only" onChange={handleImport} disabled={importing} />
          </label>
        </div>
        {importResult && (
          <p className="mt-3 text-sm text-green-700">
            {t("settings.importResult", {
              c: Object.values(importResult.created).reduce((a, b) => a + b, 0),
              s: Object.values(importResult.skipped).reduce((a, b) => a + b, 0),
            })}
          </p>
        )}
        {importError && <p className="mt-3 text-sm text-red-700">{t("settings.importError", { msg: importError })}</p>}
        <p className="mt-3 text-xs text-muted">
          {t("settings.backupNote")}
        </p>
      </section>
    </>
  );
}
