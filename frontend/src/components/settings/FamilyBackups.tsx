"use client";

// Server settings → Families: one family's own backups (2.8.2) – make one now, or put the family
// back as it was (never your own: it would sign you out in the middle).
import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api, ServerFamily } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type FamilyBackup = { stamp: string; created_at: string; size: number; sealed?: boolean };

export default function FamilyBackups({ family, onDone }: { family: ServerFamily; onDone: (message: string) => void }) {
  const { t, dateLocale } = useI18n();
  const [rows, setRows] = useState<FamilyBackup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get<FamilyBackup[]>(`/api/server/families/${family.id}/backups`).then(setRows).catch(() => setRows([]));
  }, [family.id]);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
      onDone(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="mt-2 w-full rounded-lg border border-edge bg-base p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-muted">{t("server.familyBackupsHint")}</span>
        <button className="btn-ghost border border-edge px-2 py-1 text-xs" disabled={busy} onClick={() => run(() => api.post(`/api/server/families/${family.id}/backups`), t("server.familyBackupMade", { name: family.name }))}>
          {t("server.familyBackupNow")}
        </button>
      </div>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {rows === null ? (
        <p className="mt-2 text-muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-muted">{t("server.familyBackupsNone")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-edge">
          {rows.map((b) => (
            <li key={b.stamp} className="flex items-center gap-2 py-1.5">
              <span className="flex-1">{when(b.created_at)}</span>
              <span className="text-muted">{mb(b.size)}</span>
              {b.sealed && <span className="rounded bg-base px-1.5 text-[10px] text-muted">{t("server.familySealed")}</span>}
              {!family.yours && (
                <button
                  className="flex items-center gap-1 rounded px-2 py-1 text-red-700 hover:bg-surface"
                  disabled={busy}
                  onClick={() => {
                    const typed = prompt(t("server.familyRestorePrompt", { name: family.name, when: when(b.created_at) }));
                    if (typed === null) return;
                    // Sealed with the family's own key (2.9.0): only the family has it.
                    const key = b.sealed ? prompt(t("server.familyRestoreKey", { name: family.name })) : null;
                    if (b.sealed && !key) return;
                    run(() => api.post(`/api/server/families/${family.id}/backups/${b.stamp}/restore?confirm=${encodeURIComponent(typed)}`, key ? { key } : undefined), t("server.familyRestored", { name: family.name }));
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {t("server.familyRestore")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
