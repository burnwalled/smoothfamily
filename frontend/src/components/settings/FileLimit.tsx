"use client";

// Server settings → how large a file the vault and the documents take (2.8.2). Files there are
// encrypted as a whole in memory, so a small server needs a limit and a big one may need none.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Limit = { max_mb: number | null; memory_mb: number | null; suggested_mb: number | null; factor: number };

export default function FileLimit() {
  const { t } = useI18n();
  const limit = useApi<Limit>("/api/admin/file-limit").data ?? null;
  const setLimit = (l: Limit) => setApiData<Limit>("/api/admin/file-limit", () => l);
  const [none, setNone] = useState(false);
  const [mb, setMb] = useState("");
  const [saved, setSaved] = useState("");

  // The fields start as the saved limit (and follow it when it is saved).
  const savedMb = limit ? String(limit.max_mb ?? limit.suggested_mb ?? 50) : null;
  const savedNone = limit?.max_mb === null;
  useEffect(() => {
    if (savedMb === null) return;
    setNone(savedNone);
    setMb(savedMb);
  }, [savedMb, savedNone]);

  async function save() {
    setSaved("");
    try {
      const l = await api.put<Limit>("/api/admin/file-limit", { max_mb: none ? null : Math.max(1, Math.round(Number(mb) || 0)) });
      setLimit(l);
      setSaved(t("server.fileLimitSaved"));
    } catch (e) {
      setSaved(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!limit) return null;
  const size = Number(mb) || 0;
  const tooMuch = !none && limit.memory_mb !== null && size * limit.factor > limit.memory_mb / 2;
  return (
    <section className="card mt-4 p-5" aria-label={t("server.fileLimitTitle")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("server.fileLimitTitle")}</h2>
      <p className="text-sm text-muted">{t("server.fileLimitWhy", { factor: limit.factor })}</p>
      <p className="mt-2 text-sm">
        {limit.memory_mb !== null
          ? t("server.fileLimitMemory", { memory: (limit.memory_mb / 1024).toFixed(1), suggested: limit.suggested_mb ?? 0 })
          : t("server.fileLimitMemoryUnknown")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={none} onChange={(e) => setNone(e.target.checked)} />
          {t("server.fileLimitNone")}
        </label>
        {!none && (
          <label className="flex items-center gap-2 text-sm">
            {t("server.fileLimitMax")}
            <input className="input w-28" type="number" min={1} inputMode="numeric" value={mb} onChange={(e) => setMb(e.target.value)} />
            MB
          </label>
        )}
        <button className="btn btn-primary" onClick={save}>
          {t("server.fileLimitSave")}
        </button>
        {saved && (
          <span role="status" className="text-sm text-muted">
            {saved}
          </span>
        )}
      </div>
      {(tooMuch || (none && limit.memory_mb !== null && limit.memory_mb < 4096)) && <p className="mt-2 text-sm text-red-700">{t("server.fileLimitWarn")}</p>}
    </section>
  );
}
