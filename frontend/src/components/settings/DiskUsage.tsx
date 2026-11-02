"use client";

// Server → Storage: where the data lives and how full the disk is.
import { useEffect, useState } from "react";
import { api, StorageInfo } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export default function DiskUsage() {
  const { t } = useI18n();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  useEffect(() => {
    api.live<StorageInfo>("/api/admin/storage", setStorage).catch(() => {});
  }, []);
  return (
      <section className="card mt-4 p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("settings.storageTitle")}</h2>
        <p className="text-xs text-muted mb-3">{t("settings.storageDesc")}</p>
        {storage ? (
          <div className="space-y-2 text-sm">
            <p><span className="font-semibold">{t("settings.storageDataDir")}: </span>{storage.data_dir}</p>
            <p><span className="font-semibold">{t("settings.storageMediaRoot")}: </span>{storage.media_root}</p>
            <p>
              <span className="font-semibold">{t("settings.storageUsage")}: </span>
              {formatBytes(storage.bytes_used)} / {formatBytes(storage.bytes_total)}
              <span className="text-muted"> ({t("settings.storageFree", { size: formatBytes(storage.bytes_free) })})</span>
            </p>
            {storage.sd_card_suspected && (
              <p className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {storage.advisory ?? t("settings.storageSdWarning")}
              </p>
            )}
            <p className="text-xs text-muted">{t("settings.storageNoMove")}</p>
            <p className="text-xs text-muted">
              <a href="/docs/STORAGE.md" target="_blank" rel="noreferrer" className="underline hover:text-ink">{t("settings.storageGuide")}</a>
              {" · "}
              <a href="/scripts/move-data.sh" target="_blank" rel="noreferrer" className="underline hover:text-ink">{t("settings.storageMoveScript")}</a>
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted">{t("common.loading")}</p>
        )}
      </section>

  );
}
