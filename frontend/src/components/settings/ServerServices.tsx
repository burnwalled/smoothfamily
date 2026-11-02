"use client";

// Server → Services: outside services for the whole server (GIPHY in chat, recipe search, the smart
// home for hosted families). Reports of problems stay on the server since 3.1.0 (Server → Reports).
import HostedSmartHome from "@/components/settings/HostedSmartHome";
import RecipeSearchSetting from "@/components/settings/RecipeSearchSetting";
import { useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

export default function ServerServices() {
  const { t } = useI18n();
  const giphyConfigured = useApi<{ configured: boolean }>("/api/admin/integrations/giphy").data?.configured ?? null;
  const setGiphyConfigured = (configured: boolean) => setApiData<{ configured: boolean }>("/api/admin/integrations/giphy", () => ({ configured }));
  const [giphyKey, setGiphyKey] = useState("");
  const [error, setError] = useState("");


  async function saveGiphyKey() {
    setError("");
    try {
      const r = await api.put<{ configured: boolean }>("/api/admin/integrations/giphy", { api_key: giphyKey.trim() });
      setGiphyConfigured(r.configured);
      setGiphyKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeGiphyKey() {
    setError("");
    try {
      await api.del("/api/admin/integrations/giphy");
      setGiphyConfigured(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("server.services")}</h2>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <h3 className="mt-3 text-sm font-semibold">{t("settings.giphyTitle")}</h3>
      <p className="mt-1 text-xs text-muted">{t("settings.giphyDesc")}</p>
      <p className="mt-2 flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        {t("settings.giphyPrivacy")}
      </p>
      {giphyConfigured ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm">
            <CircleCheck className="h-4 w-4 text-green-600" strokeWidth={2} aria-hidden />
            {t("settings.giphyEnabled")}
          </span>
          <button className="text-xs text-red-700 hover:underline" onClick={removeGiphyKey}>
            {t("settings.giphyDisable")}
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveGiphyKey();
          }}
        >
          <input
            className="input flex-1"
            type="password"
            autoComplete="off"
            placeholder={t("settings.giphyKeyPh")}
            value={giphyKey}
            onChange={(e) => setGiphyKey(e.target.value)}
          />
          <button className="btn-primary shrink-0" type="submit" disabled={giphyKey.trim().length < 10}>
            {t("settings.giphyEnable")}
          </button>
        </form>
      )}
      <RecipeSearchSetting />
      <HostedSmartHome />
    </section>
  );
}
