"use client";

import { Suspense, useState } from "react";
import AiAssist from "@/components/AiAssist";
import { api, FamilyList, ImportResult, isoDate, ListItem, MealPlan, postRaw, Recipe, RecipeIngredient } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { keepPreviousData } from "@tanstack/react-query";
import { BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { formatIsoWeekRange, getIsoWeek, startOfIsoWeek } from "@/lib/week";
import PageTitle from "@/components/PageTitle";
import CookingView from "@/components/CookingView";
import { AiTextButton, RecipePhotoButton, AiJobButton } from "@/components/LocalAi";

export default function FoodPage() {
  return (
    <Suspense>
      <Food />
    </Suspense>
  );
}

function Food() {
  const { t, dateLocale } = useI18n();
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [chosenListId, setShoppingListId] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [servings, setServings] = useState(4);
  const [preferences, setPreferences] = useState("");
  const [prompt, setPrompt] = useState("");
  const [newItem, setNewItem] = useState("");
  // The recipe or dinner open in cooking mode.
  const [cooking, setCooking] = useState<{ name: string; servings: number; ingredients: { name: string; amount: number | null; unit: string | null }[]; steps: string[] } | null>(null);
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());

  const week = isoDate(weekStart);

  const resolveShoppingList = (rows: FamilyList[]) => {
    const byName = rows.find((lst) => lst.name.toLowerCase() === "shopping");
    return byName ?? rows[0] ?? null;
  };

  // From the cache: what is written here, or elsewhere in the family, refreshes it by itself.
  const planPath = `/api/meals/plan?week_start=${week}`;
  const plan = useApi<MealPlan | null>(planPath, { placeholderData: keepPreviousData }).data ?? null;
  const recipes = useApi<Recipe[]>("/api/meals/recipes").data ?? NONE;
  const lists = useApi<FamilyList[]>("/api/lists").data ?? NONE;
  // The list chosen, or the one called Shopping (else the first).
  const shoppingListId = (lists.some((l) => l.id === chosenListId) ? chosenListId : resolveShoppingList(lists)?.id) ?? "";
  const itemsPath = shoppingListId ? `/api/lists/${shoppingListId}/items` : null;
  const items = useApi<ListItem[]>(itemsPath).data ?? NONE;

  async function fetchPrompt() {
    const result = await api.get<{ prompt: string }>(
      `/api/meals/prompt?week_start=${week}&servings=${servings}&preferences=${encodeURIComponent(preferences)}`
    );
    setPrompt(result.prompt);
  }

  function shiftWeek(delta: number) {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + delta * 7);
    setWeekStart(next);
    setPrompt("");
  }

  async function generateShoppingList() {
    const result = await api.post<ImportResult>(`/api/meals/plan/shopping-list?week_start=${week}`);
    alert(t("food.shoppingAdded", { n: result.imported }));
  }

  async function addItem() {
    if (!newItem.trim()) return;
    let targetId = shoppingListId;
    if (!targetId) {
      const created = await api.post<FamilyList>("/api/lists", { name: "Shopping" });
      targetId = created.id;
    }
    await api.post(`/api/lists/${targetId}/items`, { name: newItem.trim(), category: "other" });
    setNewItem("");
  }





  async function saveAsRecipe(mealId: string) {
    await api.post(`/api/meals/recipes/from-meal/${mealId}`);
  }



  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(dateLocale, { weekday: "long", timeZone: "UTC" })
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle title={t("food.title")} />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => shiftWeek(-1)}>{t("food.prevWeek")}</button>
          <button className="btn-ghost" onClick={() => setWeekStart(startOfIsoWeek(new Date()))}>{t("food.thisWeek")}</button>
          <button className="btn-ghost" onClick={() => shiftWeek(1)}>{t("food.nextWeek")}</button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        {t("common.weekShort")}{getIsoWeek(weekStart)} ({formatIsoWeekRange(weekStart, dateLocale)})
      </p>

      <section className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("food.dinners")}</h2>
          <div className="flex gap-2">
            {plan && (
              <button className="btn-accent px-3 py-1 text-xs" onClick={generateShoppingList}>
                {t("food.generateShopping")}
              </button>
            )}
            <button className="btn-primary px-3 py-1 text-xs" onClick={() => setShowAi((v) => !v)}>
              {showAi ? (
                t("food.closeAi")
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t("food.planWithAi")}
                </span>
              )}
            </button>
          </div>
        </div>

        {showAi && (
          <div className="mt-4 rounded-lg border border-edge p-4">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="label">{t("food.servings")}</label>
                <input className="input" type="number" min={1} max={20} value={servings}
                  onChange={(e) => setServings(Number(e.target.value))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">{t("food.preferences")}</label>
                <input className="input" value={preferences} onChange={(e) => setPreferences(e.target.value)}
                  placeholder={t("food.preferencesPh")} />
              </div>
            </div>
            <div className="mb-3">
              <AiJobButton body={{ kind: "meal_plan", week_start: week, servings, preferences }} label={t("food.planLocal")} or={t("ai.orCopy")} />
            </div>
            {!prompt ? (
              <button className="btn-ghost border border-edge" onClick={fetchPrompt}>{t("food.createPrompt")}</button>
            ) : (
              <AiAssist
                prompt={prompt}
                importLabel={t("food.planWithAi")}
                onImport={async (raw) => {
                  const imported = await postRaw<MealPlan>(`/api/meals/import?week_start=${week}`, raw);
                  // The import doesn't go through api.post: put the plan in the cache by hand.
                  setApiData<MealPlan | null>(planPath, () => imported);
                  setShowAi(false);
                  setPrompt("");
                  return t("food.shoppingAdded", { n: imported.meals.length }).replace(
                    t("food.shoppingAdded", { n: imported.meals.length }),
                    `${imported.meals.length} dinners imported.`
                  );
                }}
              />
            )}
          </div>
        )}

        {!plan ? (
          <p className="mt-4 text-sm text-muted">{t("food.noPlan")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {plan.meals.map((meal) => {
              const stepsOpen = expandedMeals.has(meal.id);
              const toggleSteps = () => setExpandedMeals((prev) => { const next = new Set(prev); next.has(meal.id) ? next.delete(meal.id) : next.add(meal.id); return next; });
              return (
                <li key={meal.id} className="rounded-lg border border-edge p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold">{weekdays[meal.weekday]}: {meal.name}</span>
                    <span className="text-xs text-muted flex items-center gap-2">
                      {t("food.servingsShort", { n: meal.servings })}
                      <button className="rounded border border-edge px-2 py-0.5 text-[10px]" onClick={() => saveAsRecipe(meal.id)}>
                        {t("food.saveAsRecipe")}
                      </button>
                    </span>
                  </div>
                  {meal.description && <p className="mt-1 text-xs text-muted">{meal.description}</p>}
                  {meal.ingredients.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {meal.ingredients
                        .map((i) =>
                          i.amount != null
                            ? `${i.name} (${i.amount % 1 ? i.amount : Math.trunc(i.amount)} ${i.unit ?? ""})`.trim()
                            : i.name
                        )
                        .join(", ")}
                    </p>
                  )}
                  {meal.steps.length > 0 && (
                    <div className="mt-2">
                      <button className="mr-3 rounded border border-accent bg-accent-soft px-2 py-0.5 text-xs font-semibold" onClick={() => setCooking(meal)}>
                        {t("cook.open")}
                      </button>
                      <button
                        className="text-xs text-primary-700 underline hover:no-underline"
                        onClick={toggleSteps}
                      >
                        {stepsOpen ? "▲" : "▼"} {t("food.stepsToggle")} ({meal.steps.length})
                      </button>
                      {stepsOpen && (
                        <ol className="mt-2 space-y-1 pl-4 list-decimal text-xs text-ink">
                          {meal.steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mt-4 flex flex-wrap items-center gap-3 p-5">
        <BookOpen className="h-5 w-5 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("nav.recipes")}</h2>
          <p className="text-sm text-muted">{t("recipes.moved")}</p>
        </div>
        <Link href="/recipes" className="btn-primary">{t("recipes.open")}</Link>
      </section>

      <section className="card mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("shopping.title")}</h2>
          {items.some((i) => i.done) && (
            <button className="btn-ghost px-3 py-1 text-xs"
              onClick={async () => { if (shoppingListId) await api.del(`/api/lists/${shoppingListId}/done`); }}>
              {t("shopping.clearCompleted")}
            </button>
          )}
        </div>
        {lists.length > 1 && (
          <select className="input mt-3 max-w-xs" value={shoppingListId} onChange={(e) => setShoppingListId(e.target.value)}>
            {lists.map((lst) => (
              <option key={lst.id} value={lst.id}>{lst.name}</option>
            ))}
          </select>
        )}
        <ul className="mt-3 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <label className={`flex flex-1 cursor-pointer items-center gap-2 text-sm ${item.done ? "line-through opacity-60" : ""}`}>
                <input type="checkbox" checked={item.done} className="h-4 w-4 accent-primary-700"
                  onChange={(e) => {
                    const done = e.target.checked;
                    if (!itemsPath) return;
                    setApiData<ListItem[]>(itemsPath, (rows) => rows?.map((x) => (x.id === item.id ? { ...x, done } : x)));
                    void api.patch(`${itemsPath}/${item.id}`, { done });
                  }} />
                {item.name}
              </label>
              <button className="text-xs text-red-700 hover:underline"
                onClick={async () => { if (shoppingListId) await api.del(`/api/lists/${shoppingListId}/items/${item.id}`); }}>
                {t("shopping.remove")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input className="input" placeholder={t("shopping.addPh")} value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()} />
          <button className="btn-primary shrink-0" onClick={addItem} disabled={!newItem.trim()}>
            {t("common.add")}
          </button>
        </div>
      </section>
      {cooking && <CookingView {...cooking} onClose={() => setCooking(null)} />}
    </>
  );
}
