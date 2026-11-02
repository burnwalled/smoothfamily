"use client";

// Server settings → the server's address on the internet (2.8.4). Share, guest, invitation,
// co-parent, kiosk and calendar links point here; PUBLIC_URL is the fallback.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Address = { external_url: string | null; env_url: string | null; effective: string | null };

export default function ServerAddress() {
  const { t } = useI18n();
  const [address, setAddress] = useState<Address | null>(null);
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api.get<Address>("/api/admin/external-url").then((a) => {
      setAddress(a);
      setUrl(a.external_url ?? "");
    }).catch(() => {});
  }, []);

  async function save(value: string) {
    setSaved("");
    try {
      const a = await api.put<Address>("/api/admin/external-url", { external_url: value });
      setAddress(a);
      setUrl(a.external_url ?? "");
      setSaved(t("server.addressSaved"));
    } catch (e) {
      setSaved(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!address) return null;
  const here = typeof window === "undefined" ? "" : window.location.origin;
  const changed = (address.external_url ?? "") !== url.trim().replace(/\/+$/, "");
  return (
    <section className="card p-5" aria-label={t("server.addressTitle")}>
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("server.addressTitle")}</h2>
      <p className="text-sm text-muted">{t("server.addressWhy")}</p>
      <p className="mt-2 text-sm">
        {address.effective ? (
          <>
            {t("server.addressNow")} <span className="font-semibold">{address.effective}</span>
            {!address.external_url && <span className="text-muted"> ({t("server.addressFromEnv")})</span>}
          </>
        ) : (
          <span className="text-amber-800">{t("server.addressNone")}</span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input min-w-0 flex-1 sm:max-w-sm"
          inputMode="url"
          placeholder="https://family.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label={t("server.addressLabel")}
        />
        <button className="btn btn-primary" disabled={!changed} onClick={() => save(url)}>
          {t("server.addressSave")}
        </button>
        {here && here !== address.effective && (
          <button className="btn-ghost border border-edge" onClick={() => setUrl(here)}>
            {t("server.addressUseThis")}
          </button>
        )}
        {address.external_url && (
          <button className="btn-ghost" onClick={() => save("")}>
            {t("server.addressClear")}
          </button>
        )}
        {saved && (
          <span role="status" className="text-sm text-muted">
            {saved}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{t("server.addressHint")}</p>
    </section>
  );
}
