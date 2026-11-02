"use client";

// The recipe book (2.8.4): every recipe the family keeps, sorted by kind, with each member's own
// stars, favourites, the link to the original, and what can be made with what's at home. New
// recipes come from a link, a web search, pasted text, the local AI or by hand.
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Heart, Info, Search, Star } from "lucide-react";
import { api, isoDate, Recipe, RecipeIngredient } from "@/lib/api";
import { startOfIsoWeek } from "@/lib/week";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, refreshApi, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import CookingView from "@/components/CookingView";
import RecipeSearch from "@/components/RecipeSearch";
import { AiTextButton, RecipePhotoButton } from "@/components/LocalAi";
import { EmptyState } from "@/components/PageTitle";

export const RECIPE_CATEGORIES = ["everyday", "weekend", "vegetarian", "fish", "soup", "salad", "baking", "dessert", "breakfast", "kids", "party", "other"] as const;

type AtHome = Record<string, { have: number; total: number; missing: string[] }>;

// "https://www.coop.se/recept/kottfarslimpa/" → "Kottfarslimpa" as a first guess at the name.
function nameFromUrl(url: string): string {
  try {
    const slug = new URL(url.trim()).pathname.split("/").filter(Boolean).pop() ?? "";
    const words = decodeURIComponent(slug).replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\d{3,}\b/g, "").trim();
    return words ? words[0].toUpperCase() + words.slice(1) : "";
  } catch {
    return "";
  }
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Why a link can't be imported right now (ICA, Coop …), or null. */
export function notImportable(url: string, sites: Record<string, string>): string | null {
  const host = siteOf(url.trim()).toLowerCase();
  const site = Object.keys(sites).find((s) => host === s || host.endsWith(`.${s}`));
  return site ? sites[site] : null;
}

function Stars({ value, onChange, label }: { value: number; onChange: (stars: number) => void; label: string }) {
  return (
    <span className="inline-flex" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={String(n)}
          className={`p-0.5 ${n <= value ? "text-amber-500" : "text-edge hover:text-amber-300"}`}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <Star className="h-4 w-4" fill={n <= value ? "currentColor" : "none"} strokeWidth={2} aria-hidden />
        </button>
      ))}
    </span>
  );
}

const NOTHING_AT_HOME: AtHome = {};
const NO_SITES: Record<string, string> = {};

export default function RecipeBook() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role !== "child";
  const searchFor = useSearchParams().get("search") ?? "";
  // From the cache: a saved, imported or rated recipe (here or elsewhere) refreshes the book, and a
  // change in the pantry what is at home.
  const book = useApi<Recipe[]>("/api/meals/recipes");
  const recipes = book.data ?? (book.isError ? NONE : null);
  const atHome = useApi<AtHome>("/api/meals/recipes/at-home").data ?? NOTHING_AT_HOME;
  const notImportableSites = useApi<{ not_importable?: Record<string, string> }>("/api/meals/recipes/search/status").data?.not_importable ?? NO_SITES;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [canMake, setCanMake] = useState(false);
  const [sort, setSort] = useState<"new" | "rating" | "name">("new");
  const [weekday, setWeekday] = useState(0);
  const [message, setMessage] = useState("");
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [adding, setAdding] = useState(!!searchFor);
  // Import from a link, or pasted text when the link can't be read.
  const [recipeUrl, setRecipeUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [urlResult, setUrlResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [importInfo, setImportInfo] = useState(false);
  const [paste, setPaste] = useState<{ name: string; servings: number; ingredients: string; steps: string; source: string } | null>(null);
  // A recipe by hand.
  const [draft, setDraft] = useState({ name: "", description: "", servings: 4, category: "" });
  const [draftIngredients, setDraftIngredients] = useState<RecipeIngredient[]>([]);
  const [ing, setIng] = useState({ name: "", amount: "", unit: "", category: "other" });


  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (recipes ?? []).filter((r) => {
      if (category && r.category !== category) return false;
      if (favorites && !r.favorite) return false;
      const home = atHome[r.id];
      if (canMake && !(home && home.total > 0 && home.have === home.total)) return false;
      if (needle && !`${r.name} ${r.description ?? ""} ${r.ingredients.map((i) => i.name).join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    if (sort === "rating") rows.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.ratings - a.ratings);
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, dateLocale));
    return rows;
  }, [recipes, query, category, favorites, canMake, sort, atHome, dateLocale]);

  async function act(action: () => Promise<unknown>, done?: string) {
    setMessage("");
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const blocked = recipeUrl.trim() ? notImportable(recipeUrl, notImportableSites) : null;

  async function importFromUrl() {
    setImportingUrl(true);
    setUrlResult(null);
    try {
      const recipe = await api.post<Recipe>("/api/meals/recipes/from-url", { url: recipeUrl.trim() });
      setRecipeUrl("");
      setUrlResult({
        ok: true,
        text: t("food.importedFromUrl", { name: recipe.name, n: recipe.ingredients.length }) + (recipe.steps.length === 0 ? ` ${t("food.importedNoSteps")}` : ""),
      });
    } catch (e) {
      setUrlResult({ ok: false, text: `${e instanceof Error ? e.message : t("common.error")}. ${t("food.importFailedPaste")}` });
      setPaste({ name: nameFromUrl(recipeUrl), servings: 4, ingredients: "", steps: "", source: recipeUrl.trim() });
    } finally {
      setImportingUrl(false);
    }
  }

  async function saveFromText() {
    if (!paste) return;
    try {
      const recipe = await api.post<Recipe>("/api/meals/recipes/from-text", { name: paste.name.trim(), servings: paste.servings, ingredients: paste.ingredients, steps: paste.steps, source_url: paste.source || null });
      setPaste(null);
      setRecipeUrl("");
      setUrlResult({ ok: true, text: t("food.importedFromUrl", { name: recipe.name, n: recipe.ingredients.length }) });
    } catch (e) {
      setUrlResult({ ok: false, text: e instanceof Error ? e.message : t("common.error") });
    }
  }

  async function createRecipe() {
    if (!draft.name.trim()) return;
    await act(async () => {
      await api.post("/api/meals/recipes", { name: draft.name.trim(), description: draft.description || null, servings: draft.servings, category: draft.category, ingredients: draftIngredients });
      setDraft({ name: "", description: "", servings: 4, category: "" });
      setDraftIngredients([]);
    });
  }

  async function uploadPhoto(recipeId: string, file: File) {
    const data = new FormData();
    data.append("file", file);
    const resp = await fetch(`/api/meals/recipes/${recipeId}/photo`, { method: "POST", body: data, credentials: "same-origin" });
    if (!resp.ok) setMessage(await resp.text());
  }

  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(dateLocale, { weekday: "long", timeZone: "UTC" }));
  const catLabel = (c: string) => t(`recipes.cat.${c}` as TranslationKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input w-full !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("recipes.searchPh")} aria-label={t("recipes.search")} />
        </div>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("recipes.sort")}>
          <option value="new">{t("recipes.sortNew")}</option>
          <option value="rating">{t("recipes.sortRating")}</option>
          <option value="name">{t("recipes.sortName")}</option>
        </select>
        <button className="btn-primary" onClick={() => setAdding(!adding)} aria-expanded={adding}>{t("recipes.add")}</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button aria-pressed={!category} className={`rounded-full border px-3 py-1 text-sm ${!category ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} onClick={() => setCategory("")}>{t("recipes.all")}</button>
        {RECIPE_CATEGORIES.filter((c) => (recipes ?? []).some((r) => r.category === c)).map((c) => (
          <button key={c} aria-pressed={category === c} className={`rounded-full border px-3 py-1 text-sm ${category === c ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} onClick={() => setCategory(category === c ? "" : c)}>{catLabel(c)}</button>
        ))}
        <button aria-pressed={favorites} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${favorites ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} onClick={() => setFavorites(!favorites)}>
          <Heart className="h-3.5 w-3.5" aria-hidden />
          {t("recipes.favorites")}
        </button>
        {Object.keys(atHome).length > 0 && (
          <button aria-pressed={canMake} className={`rounded-full border px-3 py-1 text-sm ${canMake ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted hover:text-ink"}`} onClick={() => setCanMake(!canMake)}>{t("recipes.canMake")}</button>
        )}
      </div>

      {adding && (
        <section className="card p-4" aria-label={t("recipes.add")}>
          <form
            className="rounded border border-edge p-3"
            onSubmit={(e) => {
              e.preventDefault();
              importFromUrl();
            }}
          >
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("food.importFromUrl")}
              <button type="button" className="grid h-7 w-7 place-items-center rounded-full normal-case text-muted hover:bg-base hover:text-ink" title={t("food.importInfo")} aria-label={t("food.importInfoLabel")} aria-expanded={importInfo} onClick={() => setImportInfo((v) => !v)}>
                <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </h3>
            <p className="mt-1 text-xs text-muted">{t("food.importFromUrlHint")}</p>
            {importInfo && <p className="mt-2 rounded border border-edge bg-base p-2 text-xs text-ink">{t("food.importInfo")}</p>}
            <div className="mt-2 flex gap-2">
              <input className="input flex-1" type="url" inputMode="url" placeholder="https://…" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} aria-label={t("food.importFromUrl")} />
              <button className="btn-primary shrink-0" type="submit" disabled={!/^https?:\/\/\S+/.test(recipeUrl.trim()) || importingUrl || !!blocked} title={blocked ?? undefined}>
                {importingUrl ? t("common.loading") : t("food.importButton")}
              </button>
            </div>
            {blocked && <p className="mt-2 text-xs text-amber-800">{t("recipes.notImportable", { site: siteOf(recipeUrl) })}</p>}
            {urlResult && <p className={`mt-2 text-sm ${urlResult.ok ? "text-green-700" : "text-red-700"}`}>{urlResult.text}</p>}
            {!paste && (
              <button type="button" className="mt-2 text-xs text-muted underline hover:text-ink" onClick={() => setPaste({ name: nameFromUrl(recipeUrl), servings: 4, ingredients: "", steps: "", source: recipeUrl.trim() })}>
                {t("food.pasteInstead")}
              </button>
            )}
          </form>

          <RecipeSearch initial={searchFor} notImportable={notImportableSites} onImported={() => void refreshApi("/api/meals/recipes")} />

          {paste && (
            <div className="mt-3 rounded border border-accent p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("food.pasteTitle")}</h3>
              <p className="mt-1 text-xs text-muted">{t("food.pasteHint")}</p>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                <input className="input" placeholder={t("food.recipeNamePh")} value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} aria-label={t("food.recipeNamePh")} />
                <label className="flex items-center gap-2 text-sm">
                  {t("food.pasteServings")}
                  <input className="input w-20" type="number" min={1} max={20} value={paste.servings} onChange={(e) => setPaste({ ...paste, servings: Number(e.target.value) || 4 })} />
                </label>
                <textarea className="input min-h-40 md:col-span-2" placeholder={t("food.pasteIngredientsPh")} value={paste.ingredients} onChange={(e) => setPaste({ ...paste, ingredients: e.target.value })} aria-label={t("food.pasteIngredientsPh")} />
                <textarea className="input min-h-40 md:col-span-2" placeholder={t("food.pasteStepsPh")} value={paste.steps} onChange={(e) => setPaste({ ...paste, steps: e.target.value })} aria-label={t("food.pasteStepsPh")} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary" onClick={saveFromText} disabled={!paste.name.trim() || !paste.ingredients.trim()}>{t("food.saveRecipe")}</button>
                <button className="btn-ghost" onClick={() => setPaste(null)}>{t("common.cancel")}</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 border-t border-edge pt-3">
                <AiTextButton kind="recipe" text={[paste.name, paste.ingredients, paste.steps].filter(Boolean).join("\n\n")} label={t("ai.recipeFromText")} disabled={!(paste.ingredients.trim() || paste.steps.trim())} />
                <RecipePhotoButton />
              </div>
            </div>
          )}

          <div className="mt-3 rounded border border-edge p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("food.newRecipe")}</h3>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <input className="input" placeholder={t("food.recipeNamePh")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label={t("food.recipeNamePh")} />
              <input className="input" placeholder={t("food.recipeDescPh")} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label={t("food.recipeDescPh")} />
              <input className="input" type="number" min={1} max={20} value={draft.servings} onChange={(e) => setDraft({ ...draft, servings: Number(e.target.value) })} aria-label={t("food.pasteServings")} />
              <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label={t("recipes.category")}>
                <option value="">{t("recipes.noCategory")}</option>
                {RECIPE_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-5">
              <input className="input" placeholder={t("food.ingredientNamePh")} value={ing.name} onChange={(e) => setIng({ ...ing, name: e.target.value })} aria-label={t("food.ingredientNamePh")} />
              <input className="input" placeholder={t("food.ingredientAmountPh")} value={ing.amount} onChange={(e) => setIng({ ...ing, amount: e.target.value })} aria-label={t("food.ingredientAmountPh")} />
              <input className="input" placeholder={t("food.ingredientUnitPh")} value={ing.unit} onChange={(e) => setIng({ ...ing, unit: e.target.value })} aria-label={t("food.ingredientUnitPh")} />
              <select className="input" value={ing.category} onChange={(e) => setIng({ ...ing, category: e.target.value })}>
                {["produce", "bread", "dairy", "meat_fish", "frozen", "pantry", "snacks", "beverages", "household", "other"].map((c) => (
                  <option key={c} value={c}>{t(`lists.category.${c}` as TranslationKey)}</option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={() => {
                  if (!ing.name.trim()) return;
                  setDraftIngredients((prev) => [...prev, { name: ing.name.trim(), amount: ing.amount.trim() ? Number(ing.amount.replace(",", ".")) : null, unit: ing.unit.trim() || null, category: ing.category as RecipeIngredient["category"] }]);
                  setIng({ name: "", amount: "", unit: "", category: "other" });
                }}
              >
                {t("common.add")}
              </button>
            </div>
            {draftIngredients.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {draftIngredients.map((d, i) => <li key={i}>{d.name} {d.amount ?? ""} {d.unit ?? ""}</li>)}
              </ul>
            )}
            <button className="btn-accent mt-3" onClick={createRecipe} disabled={!draft.name.trim()}>{t("food.saveRecipe")}</button>
          </div>
        </section>
      )}

      {message && <p role="status" className="text-sm text-muted">{message}</p>}

      {recipes === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <EmptyState>{recipes.length === 0 ? t("recipes.empty") : t("recipes.noMatches")}</EmptyState>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("food.planFromRecipe")}</span>
            <select className="input w-auto py-1" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label={t("food.planFromRecipe")}>
              {weekdays.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((recipe) => {
              const home = atHome[recipe.id];
              return (
                <li key={recipe.id} className="card flex flex-col gap-2 p-3 text-sm">
                  <div className="flex items-start gap-3">
                    {recipe.photo_key ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/meals/recipes/${recipe.id}/photo`} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{recipe.name}</p>
                      <p className="text-xs text-muted">
                        {[recipe.category ? catLabel(recipe.category) : null, t("food.servingsShort", { n: recipe.servings })].filter(Boolean).join(" · ")}
                      </p>
                      {recipe.source_url && (
                        <a href={recipe.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                          {t("recipes.original", { site: siteOf(recipe.source_url) })}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                    {adult && (
                      <button className={`rounded p-1.5 ${recipe.favorite ? "text-red-600" : "text-muted hover:text-ink"}`} aria-pressed={recipe.favorite} aria-label={t("recipes.favorite")} title={t("recipes.favorite")} onClick={() => act(() => api.patch(`/api/meals/recipes/${recipe.id}`, { favorite: !recipe.favorite }))}>
                        <Heart className="h-4 w-4" fill={recipe.favorite ? "currentColor" : "none"} aria-hidden />
                      </button>
                    )}
                  </div>
                  {recipe.description && <p className="text-xs text-muted">{recipe.description}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <Stars value={recipe.my_rating} label={t("recipes.myRating", { name: recipe.name })} onChange={(stars) => act(() => api.put(`/api/meals/recipes/${recipe.id}/rating`, { stars }))} />
                    <span className="text-muted">{recipe.rating !== null ? t("recipes.familyRating", { rating: recipe.rating.toLocaleString(dateLocale), n: recipe.ratings }) : t("recipes.notRated")}</span>
                    {home && home.total > 0 && (
                      <span className={home.have === home.total ? "font-semibold text-green-700" : "text-muted"} title={home.missing.length ? t("recipes.missing", { items: home.missing.join(", ") }) : undefined}>
                        {home.have === home.total ? t("recipes.allAtHome") : t("recipes.atHome", { have: home.have, total: home.total })}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <button className="rounded border border-accent bg-accent-soft px-2 py-1 text-xs font-semibold" onClick={() => setCooking(recipe)}>{t("cook.open")}</button>
                    <button className="rounded border border-edge px-2 py-1 text-xs" onClick={() => act(() => api.post(`/api/meals/plan/from-recipe/${recipe.id}`, { week_start: isoDate(startOfIsoWeek(new Date())), weekday }), t("recipes.addedToWeek", { day: weekdays[weekday] }))}>{t("food.addToWeek")}</button>
                    {adult && (
                      <select className="rounded border border-edge bg-transparent px-1 py-1 text-xs" value={recipe.category} onChange={(e) => act(() => api.patch(`/api/meals/recipes/${recipe.id}`, { category: e.target.value }))} aria-label={t("recipes.category")}>
                        <option value="">{t("recipes.noCategory")}</option>
                        {RECIPE_CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
                      </select>
                    )}
                    <label className="cursor-pointer rounded border border-edge px-2 py-1 text-xs">
                      {t("food.recipePhoto")}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) await uploadPhoto(recipe.id, file); e.currentTarget.value = ""; }} />
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {cooking && <CookingView name={cooking.name} servings={cooking.servings} ingredients={cooking.ingredients} steps={cooking.steps} onClose={() => setCooking(null)} />}
    </div>
  );
}
