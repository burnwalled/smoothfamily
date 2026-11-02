"use client";

// The recipe book on the kitchen display (3.0.4): the family's recipes as big tiles, the favourites
// first; "All recipes" opens the whole book with a search. A tap opens the cooking mode – the recipe
// in big type, ingredients to tick off and the steps one at a time.
import { useEffect, useState } from "react";
import { ChefHat, Search, Star, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type KioskRecipe = { id: string; name: string; category: string; favorite: boolean; photo: boolean };
const SHOWN = 6;

function Tile({ token, recipe, onOpen }: { token: string; recipe: KioskRecipe; onOpen: (r: KioskRecipe) => void }) {
  return (
    <button className="flex min-h-20 items-center gap-3 rounded-2xl border-2 border-edge bg-base p-2 text-left active:bg-surface" onClick={() => onOpen(recipe)}>
      {recipe.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/kiosk/${token}/recipes/${recipe.id}/photo`} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
          <ChefHat className="h-7 w-7" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-lg font-bold leading-tight">{recipe.name}</span>
      </span>
      {recipe.favorite && <Star className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />}
    </button>
  );
}

export default function KioskRecipes({ token, onCook }: { token: string; onCook: (recipe: KioskRecipe) => void }) {
  const { t } = useI18n();
  const [recipes, setRecipes] = useState<KioskRecipe[] | null>(null);
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`/api/kiosk/${token}/recipes`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, [token]);

  if (recipes === null) return <p className="text-muted">{t("common.loading")}</p>;
  if (recipes.length === 0) return <p className="text-lg text-muted">{t("kiosk.noRecipes")}</p>;
  const found = recipes.filter((r) => r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {recipes.slice(0, SHOWN).map((r) => <Tile key={r.id} token={token} recipe={r} onOpen={onCook} />)}
      </div>
      {recipes.length > SHOWN && (
        <button className="mt-3 w-full rounded-2xl border-2 border-edge py-3 text-lg font-semibold" onClick={() => setAll(true)}>
          {t("kiosk.allRecipes", { n: recipes.length })}
        </button>
      )}
      {all && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-base p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={t("kiosk.widget.recipes")}>
          <div className="mx-auto max-w-5xl">
            <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 bg-base/95 px-4 py-3 backdrop-blur">
              <ChefHat className="h-7 w-7 shrink-0 text-accent" aria-hidden />
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
                <input className="input h-14 pl-11 text-lg" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("kiosk.searchRecipes")} aria-label={t("kiosk.searchRecipes")} />
              </label>
              <button className="btn-ghost h-14 w-14 p-0" onClick={() => setAll(false)} aria-label={t("common.close")}>
                <X className="h-7 w-7" aria-hidden />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {found.map((r) => (
                <Tile
                  key={r.id}
                  token={token}
                  recipe={r}
                  onOpen={(recipe) => {
                    setAll(false);
                    onCook(recipe);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
