"use client";

// The links I have made from the vault: what, for whom, until when, how often opened – and closing one.
import { useCallback, useEffect, useState } from "react";
import { api, VaultShare } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/PageTitle";

export default function SharedLinks() {
  const { t } = useI18n();
  const [shares, setShares] = useState<VaultShare[] | null>(null);
  const load = useCallback(() => {
    api.get<VaultShare[]>("/api/vault/shares").then(setShares).catch(() => setShares([]));
  }, []);
  useEffect(load, [load]);

  async function close(share: VaultShare) {
    await api.del(`/api/vault/shares/${share.id}`).catch(() => {});
    load();
  }

  if (shares === null) return <p className="text-sm text-muted">{t("common.loading")}</p>;
  if (shares.length === 0) return <EmptyState>{t("vault.noShares")}</EmptyState>;
  return (
    <ul className="card divide-y divide-edge">
      {shares.map((s) => (
        <li key={s.id} className="flex items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {s.title || t("vault.shareGone")}
              <span className="ml-2 text-xs font-normal text-muted">{t(`vault.shareKind.${s.kind}` as TranslationKey)}</span>
            </p>
            {s.label && <p className="truncate text-sm">{t("vault.sharedFor", { name: s.label })}</p>}
            <p className="text-xs text-muted">
              {s.active ? t("vault.shareUntil", { date: new Date(s.expires_at).toLocaleString() }) : t("vault.shareClosed")}
              {" · "}
              {t("vault.shareViews", { n: s.views })}
              {s.one_time && ` · ${t("vault.oneTime")}`}
              {s.allow_download && ` · ${t("vault.allowDownload")}`}
            </p>
          </div>
          {s.active && (
            <button className="btn shrink-0 text-red-600" onClick={() => close(s)} aria-label={t("vault.closeShare", { name: s.title })}>
              {t("vault.close")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
