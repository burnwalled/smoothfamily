"use client";

// Server settings → Address and services: recipe search on the web through the server's own
// SearXNG (2.8.3). Since 2.8.4 it is installed with the server and turned on here with one click;
// another SearXNG can still be given by its address.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Setting = { url: string | null; bundled: string | null };
type Health = { ok: boolean; version: string | null; hits: number | null; unresponsive: { engine: string; reason: string }[]; error: string | null };

export default function RecipeSearchSetting() {
  const { t } = useI18n();
  const setting = useApi<Setting>("/api/admin/integrations/recipe-search").data ?? null;
  const setSetting = (next: Setting) => setApiData<Setting>("/api/admin/integrations/recipe-search", () => next);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      setHealth(await api.get<Health>("/api/admin/integrations/recipe-search/health"));
    } catch {
      setHealth(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  // The field starts as the saved address of another SearXNG (and follows it when it is saved).
  const savedUrl = setting?.url && setting.url !== setting.bundled ? setting.url : "";
  useEffect(() => {
    setUrl(savedUrl);
  }, [savedUrl]);

  async function save(next: string | null) {
    setBusy(true);
    setStatus("");
    try {
      const r = await api.put<Setting>("/api/admin/integrations/recipe-search", { url: next });
      setSetting(r);
      setUrl(r.url && r.url !== r.bundled ? r.url : "");
      setStatus(r.url ? t("server.recipeSearchOn") : t("server.recipeSearchOff"));
      check();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  if (!setting) return null;
  const on = !!setting.url;
  const custom = (
    <div className="mt-2 flex flex-wrap gap-2">
      <input className="input min-w-56 flex-1" type="url" inputMode="url" placeholder="http://192.168.1.10:8888" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t("server.recipeSearchUrl")} />
      <button className="btn-primary" disabled={busy || !/^https?:\/\/\S+/.test(url.trim())} onClick={() => save(url.trim())}>
        {busy ? t("common.loading") : t("server.recipeSearchSave")}
      </button>
    </div>
  );

  return (
    <div className="mt-5 border-t border-edge pt-4">
      <h3 className="text-sm font-semibold">{t("server.recipeSearch")}</h3>
      <p className="mt-1 text-xs text-muted">{setting.bundled ? t("server.recipeSearchHint") : t("server.recipeSearchCustomHint")}</p>
      <p className="mt-2 text-sm">
        <span className={`mr-2 inline-block h-2 w-2 rounded-full ${on ? "bg-green-600" : "bg-edge"}`} aria-hidden />
        {on ? (setting.url === setting.bundled ? t("server.recipeSearchOnBundled") : t("server.recipeSearchOnCustom", { url: setting.url ?? "" })) : t("server.recipeSearchOff")}
      </p>
      {(setting.url || setting.bundled) && (
        <div className="mt-2 rounded bg-base px-3 py-2 text-xs text-muted" aria-label={t("server.searchHealth")}>
          {checking && !health ? (
            t("common.loading")
          ) : health ? (
            <>
              <p>
                {health.version ? `SearXNG ${health.version} · ` : ""}
                {health.ok ? (health.hits === null ? t("server.searchHealthReady") : t("server.searchHealthOk", { n: health.hits })) : <span className="text-red-700">{t("server.searchHealthDown", { error: health.error ?? t("server.searchHealthNoHits") })}</span>}
              </p>
              {health.unresponsive.length > 0 && (
                <p className="mt-1">{t("server.searchHealthSlow", { engines: health.unresponsive.map((e) => `${e.engine} (${e.reason})`).join(", ") })}</p>
              )}
            </>
          ) : null}
          <button className="mt-1 underline hover:text-ink" disabled={checking} onClick={check}>
            {t("server.searchHealthCheck")}
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {setting.bundled && setting.url !== setting.bundled && (
          <button className="btn-primary" disabled={busy} onClick={() => save(setting.bundled)}>
            {busy ? t("common.loading") : t("server.recipeSearchTurnOn")}
          </button>
        )}
        {on && (
          <button className="btn-ghost text-red-700" disabled={busy} onClick={() => save(null)}>
            {t("server.recipeSearchTurnOff")}
          </button>
        )}
      </div>
      {setting.bundled ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">{t("server.recipeSearchOther")}</summary>
          {custom}
        </details>
      ) : (
        custom
      )}
      {status && (
        <p role="status" className="mt-2 text-sm text-muted">
          {status}
        </p>
      )}
    </div>
  );
}
