"use client";

// Cooking mode: the recipe in big type while you cook – tick off ingredients, tap your way through
// the steps – and "Keep the screen on" so it doesn't go dark when your hands are full of dough.
import { useEffect, useState } from "react";
import { ChefHat, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMaybeMe } from "@/components/Shell";
import CookedPanel from "@/components/recipes/CookedPanel";

type Ingredient = { name: string; amount: number | null; unit: string | null };
type WakeLock = { release: () => Promise<void>; addEventListener?: (e: "release", cb: () => void) => void };

export default function CookingView({ name, servings, ingredients, steps, onClose }: { name: string; servings: number; ingredients: Ingredient[]; steps: string[]; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const [awake, setAwake] = useState(true);
  const [supported, setSupported] = useState(true);
  const [had, setHad] = useState<Set<number>>(new Set());
  const [step, setStep] = useState(0);
  // The kitchen display has no account: no pantry to take from there.
  const pantry = useMaybeMe()?.apps.includes("pantry") ?? false;
  const [finished, setFinished] = useState(false);

  // Keep the screen on while the switch is on and the page is in view.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } };
    if (!nav.wakeLock) {
      setSupported(false);
      return;
    }
    if (!awake) return;
    let lock: WakeLock | null = null;
    const ask = () => nav.wakeLock!.request("screen").then((l) => (lock = l)).catch(() => {});
    void ask();
    const onVisible = () => document.visibilityState === "visible" && void ask();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [awake]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const amount = (i: Ingredient) => [i.amount !== null ? i.amount.toLocaleString(dateLocale) : "", i.unit ?? ""].filter(Boolean).join(" ");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-base" role="dialog" aria-modal="true" aria-label={t("cook.title", { name })}>
      <div className="mx-auto max-w-3xl p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-6">
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 bg-base/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <ChefHat className="h-7 w-7 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          <h2 className="min-w-0 flex-1 text-2xl font-extrabold leading-tight">{name}</h2>
          <label className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${awake && supported ? "border-primary-700 bg-accent-soft" : "border-edge"}`}>
            <input type="checkbox" role="switch" className="h-5 w-5 accent-primary-700" checked={awake && supported} disabled={!supported} onChange={(e) => setAwake(e.target.checked)} />
            {t("cook.keepAwake")}
          </label>
          <button className="btn-ghost h-11 w-11 p-0" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>
        {!supported && <p className="mt-1 text-xs text-muted">{t("cook.notSupported")}</p>}

        {ingredients.length > 0 && (
          <section className="mt-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("cook.ingredients", { n: servings })}</h3>
            <ul className="grid gap-1 sm:grid-cols-2">
              {ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`}>
                  <label className={`flex min-h-12 items-center gap-3 rounded-lg px-2 text-lg ${had.has(i) ? "text-muted line-through" : ""}`}>
                    <input
                      type="checkbox"
                      className="h-6 w-6 shrink-0 accent-primary-700"
                      checked={had.has(i)}
                      onChange={() => setHad((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                    />
                    <span><span className="font-semibold">{amount(ing)}</span> {ing.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {steps.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("cook.steps")}</h3>
            <ol className="space-y-2">
              {steps.map((text, i) => (
                <li key={i}>
                  <button
                    className={`flex w-full gap-3 rounded-xl border-2 p-4 text-left text-xl leading-snug ${i === step ? "border-accent bg-surface shadow-sm" : i < step ? "border-transparent text-muted" : "border-transparent"}`}
                    onClick={() => setStep(i === step ? i + 1 : i)}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold ${i < step ? "bg-green-600 text-white" : i === step ? "bg-accent text-white" : "bg-base text-muted"}`}>{i + 1}</span>
                    <span>{text}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-center text-sm text-muted">{step >= steps.length ? t("cook.done") : t("cook.tapNext")}</p>
          </section>
        )}

        {pantry && ingredients.length > 0 && (finished ? (
          <CookedPanel ingredients={ingredients.map((i) => i.name)} onDone={onClose} />
        ) : (
          <button className="btn-primary mt-6 min-h-12 w-full text-lg" onClick={() => setFinished(true)}>{t("cooked.finish")}</button>
        ))}
      </div>
    </div>
  );
}
