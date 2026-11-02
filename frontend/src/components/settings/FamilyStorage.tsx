"use client";

// Family settings → Security and data: how much the family keeps on the server, and the ceiling the
// server's admin has set (2.8.2).
import { HardDrive } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";

export default function FamilyStorage() {
  const { t } = useI18n();
  const info = useApi<{ used_bytes: number; quota_mb: number | null }>("/api/family/storage").data ?? null;
  if (!info) return null;
  const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 ? 2 : 1);
  const share = info.quota_mb ? Math.min(1, info.used_bytes / (info.quota_mb * 1024 * 1024)) : null;
  return (
    <section className="card p-5" aria-label={t("settings.familyStorage")}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <HardDrive className="h-4 w-4" aria-hidden />
        {t("settings.familyStorage")}
      </h2>
      <p className="text-sm">
        {info.quota_mb ? t("settings.storageOf", { used: gb(info.used_bytes), quota: gb(info.quota_mb * 1024 * 1024) }) : t("settings.storageUsed", { used: gb(info.used_bytes) })}
      </p>
      {share !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-base" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <div className={`h-full ${share > 0.9 ? "bg-red-600" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">{info.quota_mb ? t("settings.storageQuotaHint") : t("settings.storageNoQuota")}</p>
    </section>
  );
}
