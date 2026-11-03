"use client";

// Server → Address and services → Addresses (3.4.0): suggestions from OpenStreetMap in the address
// fields – asked by the server through Photon (komoot's, or one of the server's own) – or none.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Places = { enabled: boolean; url: string; default_url: string };
const PATH = "/api/admin/integrations/places";

export default function PlacesSetting() {
  const { t } = useI18n();
  const saved = useApi<Places>(PATH).data;
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setUrl(saved?.url ?? ""), [saved]);
  if (!saved) return null;

  const save = (patch: Partial<Places>) => {
    setError("");
    setNote("");
    api.put<Places>(PATH, { enabled: saved.enabled, url: saved.url, ...patch })
      .then((r) => {
        setApiData<Places>(PATH, () => r);
        setApiData<{ enabled: boolean }>("/api/places/status", () => ({ enabled: r.enabled }));
        setNote(t("server.places.saved"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  };

  return (
    <div className="mt-6" role="group" aria-label={t("server.places.title")}>
      <h3 className="text-sm font-semibold">{t("server.places.title")}</h3>
      <p className="mt-1 text-xs text-muted">{t("server.places.help")}</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={saved.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        {t("server.places.on")}
      </label>
      {saved.enabled && (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); save({ url: url.trim() }); }}>
          <input className="input flex-1" type="url" value={url} placeholder={saved.default_url} aria-label={t("server.places.url")} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn-ghost border border-edge" type="submit">{t("common.save")}</button>
        </form>
      )}
      {saved.enabled && <p className="mt-1 text-xs text-muted">{t("server.places.urlHelp")}</p>}
      {note && <p className="mt-1 text-xs text-accent" role="status">{note}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
