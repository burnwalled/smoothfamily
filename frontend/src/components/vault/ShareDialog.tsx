"use client";

// Share something from the vault with a link that runs out (2.8.1): how long, once only, and whether
// the guest may download it. A login is always shown once and never downloaded.
import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";
import { api, VaultShareCreated, VaultShareKind } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const DURATIONS = [1, 24, 24 * 7, 24 * 30] as const;

export default function ShareDialog({ kind, targetId, title, downloadOnly = false, onClose }: { kind: VaultShareKind; targetId: string; title: string; downloadOnly?: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const login = kind === "login";
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState<number>(24);
  const [oneTime, setOneTime] = useState(login);
  const [download, setDownload] = useState(false);
  const [made, setMade] = useState<VaultShareCreated | null>(null);
  const [notice, setNotice] = useState("");

  async function create() {
    try {
      setMade(await api.post<VaultShareCreated>("/api/vault/shares", { kind, target_id: targetId, hours, label, one_time: oneTime, allow_download: download }));
    } catch {
      setNotice(t("common.error"));
    }
  }

  async function copy() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setNotice(t("vault.linkCopied"));
    } catch {
      setNotice(t("common.error"));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <section role="dialog" aria-label={t("vault.shareTitle", { name: title })} className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <h2 className="min-w-0 flex-1 font-bold">{t("vault.shareTitle", { name: title })}</h2>
          <button onClick={onClose} aria-label={t("common.close")}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {made ? (
          <>
            <p className="text-sm text-muted">{made.one_time ? t("vault.linkMadeOnce") : t("vault.linkMade", { date: new Date(made.expires_at).toLocaleString() })}</p>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={made.url} aria-label={t("vault.theLink")} onFocus={(e) => e.target.select()} />
              <button className="btn btn-primary" onClick={copy}>
                <Copy className="mr-1 h-4 w-4" aria-hidden />
                {t("vault.copyLink")}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm">
              {t("vault.shareFor")}
              <input className="input mt-1" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={t("vault.shareForPh")} />
            </label>
            <label className="block text-sm">
              {t("vault.validFor")}
              <select className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {DURATIONS.map((h) => (
                  <option key={h} value={h}>
                    {t(`vault.duration.${h}` as "vault.duration.1")}
                  </option>
                ))}
              </select>
            </label>
            {login ? (
              <p className="text-sm text-muted">{t("vault.loginOnce")}</p>
            ) : (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={oneTime} onChange={(e) => setOneTime(e.target.checked)} />
                  <span>
                    {t("vault.oneTime")}
                    <span className="block text-xs text-muted">{t("vault.oneTimeHelp")}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={download} onChange={(e) => setDownload(e.target.checked)} />
                  <span>
                    {t("vault.allowDownload")}
                    <span className={`block text-xs ${downloadOnly ? "font-semibold text-ink" : "text-muted"}`}>{downloadOnly ? t("vault.downloadOnlyHelp") : t("vault.allowDownloadHelp")}</span>
                  </span>
                </label>
              </>
            )}
            <button className="btn btn-primary" onClick={create}>
              {t("vault.makeLink")}
            </button>
          </>
        )}
        {notice && (
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
