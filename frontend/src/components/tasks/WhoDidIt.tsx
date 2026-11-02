"use client";

// "Who did it?" (3.0.3): on the kitchen display everyone taps their own face; a task several can do
// together takes several faces, and its points are shared between them. In the app the one ticking
// it off chooses who helped.
import { useState } from "react";
import { Check, Star, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type Doer = { id: string; name: string; color: string };

/** The points per person, the first ones getting what's left over – as the server splits them. */
export function split(points: number, n: number): number[] {
  const base = Math.floor(points / n);
  const left = points % n;
  return Array.from({ length: n }, (_, i) => base + (i < left ? 1 : 0));
}

export default function WhoDidIt({
  title, points, shared, people, first, large = false, onDone, onClose,
}: {
  title: string;
  points: number;
  shared: boolean;
  people: Doer[];
  // Chosen from the start (the one whose task it is, or you in the app); always first.
  first?: string | null;
  large?: boolean;
  onDone: (ids: string[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<string[]>(first ? [first] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      await onDone(ids);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  }

  const each = chosen.length ? split(points, chosen.length) : [];
  const face = large ? "h-24 w-24 text-4xl" : "h-14 w-14 text-xl";
  return (
    // Scrolls when a big family's faces don't fit (a phone, a small tablet).
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t("tasks.whoDidIt", { task: title })}>
      <div className={`m-auto w-full rounded-2xl bg-surface p-5 shadow-soft ${large ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className={`font-extrabold ${large ? "text-2xl" : "text-lg"}`}>{t("tasks.whoDidIt", { task: title })}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">{shared ? t("tasks.togetherHint", { points }) : t("tasks.tapYourFace")}</p>
        <ul className="flex flex-wrap justify-center gap-4">
          {people.map((p) => {
            const on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  className="flex flex-col items-center gap-1.5 disabled:opacity-50"
                  disabled={busy}
                  aria-pressed={shared ? on : undefined}
                  onClick={() => (shared ? setChosen(on ? chosen.filter((id) => id !== p.id) : [...chosen, p.id]) : finish([p.id]))}
                >
                  <span
                    className={`relative grid ${face} place-items-center rounded-full font-extrabold text-white shadow transition ${on ? "ring-4 ring-accent ring-offset-2" : ""}`}
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  >
                    {p.name.slice(0, 1).toUpperCase()}
                    {on && <Check className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-accent p-0.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className={`font-semibold ${large ? "text-lg" : "text-sm"}`}>{p.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {shared && (
          <button className={`btn-primary mt-5 w-full justify-center ${large ? "py-4 text-xl" : ""}`} disabled={busy || !chosen.length} onClick={() => finish(chosen)}>
            <Star className="h-5 w-5 fill-current" aria-hidden />
            {chosen.length > 1 ? t("tasks.doneTogether", { n: chosen.length, points: each.join(" + ") }) : t("tasks.complete", { points })}
          </button>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
