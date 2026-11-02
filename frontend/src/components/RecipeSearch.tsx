"use client";

// Food → recipes: search the web for real recipes (2.8.3), through the server's own search engine
// when its admin has set one up. A hit is imported like a recipe link.
import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { api, Recipe } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Hit = { title: string; url: string; site: string; snippet: string; importable?: boolean };

export default function RecipeSearch({ initial = "", notImportable = {}, onImported }: { initial?: string; notImportable?: Record<string, string>; onImported: (recipe: Recipe) => void }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<{ enabled: boolean }>("/api/meals/recipes/search/status").then((r) => setEnabled(r.enabled)).catch(() => {});
  }, []);

  async function search(words = query) {
    if (words.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    try {
      setHits(await api.get<Hit[]>(`/api/meals/recipes/search?q=${encodeURIComponent(words.trim())}`));
    } catch (e) {
      setHits(null);
      setMessage(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  // Opened from an idea ("Find real recipes"): search at once.
  useEffect(() => {
    if (enabled && initial.trim()) search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, initial]);

  async function importHit(hit: Hit) {
    setImporting(hit.url);
    setMessage("");
    try {
      const recipe = await api.post<Recipe>("/api/meals/recipes/from-url", { url: hit.url });
      setMessage(t("food.importedFromUrl", { name: recipe.name, n: recipe.ingredients.length }));
      onImported(recipe);
    } catch (e) {
      setMessage(`${e instanceof Error ? e.message : t("common.error")} – ${t("food.searchTryAnother")}`);
    } finally {
      setImporting(null);
    }
  }

  if (!enabled) return null;
  return (
    <div className="mt-3 rounded border border-edge p-3" id="recipe-search">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("food.searchWeb")}</h3>
      <p className="mt-1 text-xs text-muted">{t("food.searchWebHint")}</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("food.searchWebPh")} aria-label={t("food.searchWeb")} />
        <button className="btn-primary shrink-0" type="submit" disabled={busy || query.trim().length < 2} aria-label={t("food.searchWeb")}>
          <Search className="h-4 w-4" aria-hidden />
        </button>
      </form>
      {busy && <p className="mt-2 text-sm text-muted">{t("common.loading")}</p>}
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
      {hits && hits.length === 0 && <p className="mt-2 text-sm text-muted">{t("food.searchNone")}</p>}
      {hits && hits.length > 0 && (
        <ul className="mt-2 divide-y divide-edge">
          {hits.map((h) => (
            <li key={h.url} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{h.title}</p>
                <a href={h.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  {h.site}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                {h.snippet && <p className="line-clamp-2 text-xs text-muted">{h.snippet}</p>}
              </div>
              <button
                className="btn-ghost shrink-0 border border-edge px-2 py-1 text-xs"
                disabled={importing !== null || h.importable === false}
                title={h.importable === false ? Object.entries(notImportable).find(([site]) => h.site === site || h.site.endsWith(`.${site}`))?.[1] ?? t("recipes.notImportableShort") : undefined}
                onClick={() => importHit(h)}
              >
                {importing === h.url ? t("common.loading") : h.importable === false ? t("recipes.notImportableShort") : t("food.importButton")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
