"use client";

// Savings jars: parents add jars for a child ("Skateboard", "Give") that each get a share of new
// allowance – Spend gets the rest. A jar with a target is a savings goal with a progress bar.
// Adults edit the jars, add a bonus ("interest") and move money; children can put money aside
// from Spend into a jar.
import { useState } from "react";
import { Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { api, Jar, Jars } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";

const KIND_LABEL: Record<string, TranslationKey> = {
  allocation: "jars.kindAllocation",
  payout: "jars.kindPayout",
  bonus: "jars.kindBonus",
  move: "jars.kindMove",
  adjust: "jars.kindAdjust",
};

function money(value: number, currency: string, locale: string): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

const num = (s: string) => Number(s.replace(",", "."));
type JarForm = { name: string; pct: string; target: string };
const EMPTY: JarForm = { name: "", pct: "", target: "" };

export default function SavingsJars({
  jars,
  userId,
  isAdult,
  onChanged,
}: {
  jars: Jars;
  userId: string;
  isAdult: boolean;
  onChanged: (jars: Jars) => void;
}) {
  const { t, dateLocale } = useI18n();
  const [form, setForm] = useState<JarForm>(EMPTY);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState(jars.jars[0]?.id ?? "");
  const [moveAmount, setMoveAmount] = useState("");
  const [bonusJar, setBonusJar] = useState(jars.jars[0]?.id ?? "");
  const [bonus, setBonus] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const [proposing, setProposing] = useState(false);
  const [goal, setGoal] = useState({ name: "", target: "", pct: "20" });
  const [approvePct, setApprovePct] = useState<Record<string, string>>({});
  const m = (v: number) => money(v, jars.currency, dateLocale);
  const spendName = t("jars.spend");
  // Spend is "" in the selects (null to the backend).
  const options = [{ id: "", name: spendName, balance: jars.spend }, ...jars.jars];
  const toOptions = options.filter((o) => o.id !== (isAdult ? moveFrom : ""));
  // The chosen target, or the first one that makes sense (a new jar may have appeared).
  const target = toOptions.some((o) => o.id === moveTo) ? moveTo : toOptions[0]?.id ?? "";

  async function run(action: () => Promise<Jars>): Promise<boolean> {
    setError("");
    try {
      onChanged(await action());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      return false;
    }
  }

  function startEdit(jar: Jar | null) {
    setEditing(jar ? jar.id : "new");
    setForm(jar ? { name: jar.name, pct: String(jar.pct), target: jar.target ? String(jar.target) : "" } : EMPTY);
  }

  async function saveJar() {
    const body = { name: form.name.trim(), pct: Number(form.pct || 0), target: form.target.trim() ? num(form.target) : null };
    const ok = await run(() =>
      editing === "new"
        ? api.post<Jars>("/api/allowance/jars", { user_id: userId, ...body })
        : api.patch<Jars>(`/api/allowance/jars/${editing}`, body)
    );
    if (ok) {
      setEditing(null);
      setForm(EMPTY);
    }
  }

  const free = jars.spend_pct + (editing && editing !== "new" ? jars.jars.find((j) => j.id === editing)?.pct ?? 0 : 0);
  const jarForm = (
    <div className="space-y-2 rounded-lg border border-edge p-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <input className="input" placeholder={t("jars.namePh")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label={t("jars.namePh")} />
        <label className="flex items-center gap-1.5 text-sm">
          <input className="input w-20" inputMode="numeric" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value.replace(/\D/g, "") })} aria-label={t("jars.share")} placeholder="0" />
          %
        </label>
        <input className="input" inputMode="decimal" placeholder={t("jars.targetPh", { currency: jars.currency })} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} aria-label={t("jars.target")} />
      </div>
      <p className="text-xs text-muted">{t("jars.shareHint", { n: free })}</p>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={saveJar} disabled={!form.name.trim() || Number(form.pct || 0) > free}>
          {editing === "new" ? t("common.add") : t("profile.save")}
        </button>
        <button className="btn-ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</button>
      </div>
    </div>
  );

  // A child's own goals (2.8.3): proposed by the child, opened by an adult.
  const requests = jars.requests ?? [];
  const requestBlock = (
    <>
      {requests.length > 0 && (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-dashed border-accent bg-accent-soft/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">🎯 {r.name}</span>
                <span className="text-muted">{m(r.target)}</span>
                {isAdult ? (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      {t("jars.share")}
                      <input
                        className="input w-16 py-1"
                        type="number"
                        min={0}
                        max={100}
                        value={approvePct[r.id] ?? String(r.pct)}
                        onChange={(e) => setApprovePct({ ...approvePct, [r.id]: e.target.value })}
                        aria-label={t("jars.shareFor", { name: r.name })}
                      />
                      %
                    </label>
                    <button className="btn-primary px-3 py-1 text-xs" onClick={() => run(() => api.post<Jars>(`/api/allowance/jars/${r.id}/approve`, { pct: Number(approvePct[r.id] ?? r.pct) }))}>
                      {t("jars.approve")}
                    </button>
                    <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-base" onClick={() => run(() => api.del(`/api/allowance/jars/${r.id}`) as unknown as Promise<Jars>)}>
                      {t("jars.decline")}
                    </button>
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-muted">{t("jars.waiting")}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!isAdult &&
        (proposing ? (
          <div className="space-y-2 rounded-lg border border-edge p-3">
            <input className="input" placeholder={t("jars.goalNamePh")} value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} aria-label={t("jars.goalName")} />
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1 text-sm">
                {t("jars.goalCost")}
                <input className="input w-24" inputMode="decimal" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} placeholder={jars.currency} />
              </label>
              <label className="flex items-center gap-1 text-sm">
                {t("jars.goalShare")}
                <input className="input w-16" type="number" min={0} max={100} value={goal.pct} onChange={(e) => setGoal({ ...goal, pct: e.target.value })} />%
              </label>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={!goal.name.trim() || !(num(goal.target) > 0)}
                onClick={() =>
                  run(() => api.post<Jars>("/api/allowance/jars/request", { name: goal.name.trim(), target: num(goal.target), pct: Number(goal.pct) || 0 })).then((ok) => {
                    if (ok) {
                      setProposing(false);
                      setGoal({ name: "", target: "", pct: "20" });
                    }
                  })
                }
              >
                {t("jars.propose")}
              </button>
              <button className="btn-ghost" onClick={() => setProposing(false)}>
                {t("common.cancel")}
              </button>
            </div>
            <p className="text-xs text-muted">{t("jars.proposeHint")}</p>
          </div>
        ) : (
          <button className="btn-ghost border border-edge" onClick={() => setProposing(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("jars.newGoal")}
          </button>
        ))}
    </>
  );

  if (!jars.enabled) {
    if (!isAdult) {
      return (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <PiggyBank className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
            {t("jars.myGoals")}
          </h3>
          {requestBlock}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-dashed border-edge p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <PiggyBank className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
          {t("jars.title")}
        </p>
        <p className="mb-2 mt-1 text-xs text-muted">{t("jars.offHint")}</p>
        {requests.length > 0 && <div className="mb-2">{requestBlock}</div>}
        {editing ? jarForm : (
          <button className="btn-ghost border border-edge" onClick={() => startEdit(null)}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("jars.addJar")}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <PiggyBank className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
        {t("jars.title")}
      </h3>

      <ul className="grid gap-2 sm:grid-cols-2">
        <li className="rounded-lg border border-edge bg-surface p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{spendName}</span>
            <span className="text-xs text-muted">{jars.spend_pct} %</span>
          </div>
          <div className="mt-1 text-lg font-extrabold">{m(jars.spend)}</div>
          <p className="text-[11px] text-muted">{t("jars.spendHint")}</p>
        </li>
        {jars.jars.map((jar) => (
          <li key={jar.id} className="rounded-lg border border-edge bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{jar.reached_at ? "🎉 " : ""}{jar.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                {jar.pct} %
                {isAdult && (
                  <>
                    <button className="grid h-7 w-7 place-items-center rounded hover:bg-base hover:text-ink" onClick={() => startEdit(jar)} aria-label={t("jars.editJar", { name: jar.name })}>
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button
                      className="grid h-7 w-7 place-items-center rounded hover:bg-base hover:text-red-700"
                      onClick={() => confirm(t("jars.removeConfirm", { name: jar.name })) && run(() => api.del(`/api/allowance/jars/${jar.id}`) as unknown as Promise<Jars>)}
                      aria-label={t("jars.removeJar", { name: jar.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </>
                )}
              </span>
            </div>
            <div className="mt-1 text-lg font-extrabold">
              {m(jar.balance)}
              {jar.target ? <span className="text-sm font-normal text-muted"> / {m(jar.target)}</span> : null}
            </div>
            {jar.progress !== null && (
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-edge" role="progressbar" aria-label={jar.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(jar.progress * 100)}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(jar.progress * 100)}%` }} />
              </div>
            )}
            {jar.reached_at && <p className="mt-1 text-xs font-semibold text-accent">{t("jars.reached")}</p>}
          </li>
        ))}
      </ul>

      {requestBlock}

      {isAdult && (editing ? jarForm : (
        <button className="btn-ghost border border-edge" onClick={() => startEdit(null)}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("jars.addJar")}
        </button>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        {isAdult ? (
          <select className="input w-auto" value={moveFrom} onChange={(e) => setMoveFrom(e.target.value)} aria-label={t("jars.from")}>
            {options.map((o) => <option key={o.id} value={o.id}>{t("jars.fromJar", { jar: o.name })}</option>)}
          </select>
        ) : (
          <span className="pb-2 text-sm">{t("jars.putAside")}</span>
        )}
        <select className="input w-auto" value={target} onChange={(e) => setMoveTo(e.target.value)} aria-label={t("jars.to")}>
          {toOptions.map((o) => <option key={o.id} value={o.id}>{t("jars.toJar", { jar: o.name })}</option>)}
        </select>
        <input className="input w-24" inputMode="decimal" placeholder={jars.currency} value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} aria-label={t("jars.amount")} />
        <button
          className="btn-ghost border border-edge"
          disabled={!(num(moveAmount) > 0) || toOptions.length === 0}
          onClick={() =>
            run(() =>
              api.post<Jars>("/api/allowance/jars/move", {
                user_id: userId,
                from_jar_id: isAdult ? moveFrom || null : null,
                to_jar_id: target || null,
                amount: num(moveAmount),
              })
            ).then((ok) => ok && setMoveAmount(""))
          }
        >
          {t("jars.move")}
        </button>
      </div>

      {isAdult && (
        <div className="flex flex-wrap items-end gap-2">
          <select className="input w-auto" value={bonusJar} onChange={(e) => setBonusJar(e.target.value)} aria-label={t("jars.bonusTo")}>
            {options.map((o) => <option key={o.id} value={o.id}>{t("jars.toJar", { jar: o.name })}</option>)}
          </select>
          <input className="input w-24" inputMode="decimal" placeholder={jars.currency} value={bonus} onChange={(e) => setBonus(e.target.value)} aria-label={t("jars.bonus")} />
          <button
            className="btn-ghost border border-edge"
            disabled={!(num(bonus) > 0)}
            onClick={() => run(() => api.post<Jars>("/api/allowance/jars/bonus", { user_id: userId, jar_id: bonusJar || null, amount: num(bonus) })).then((ok) => ok && setBonus(""))}
          >
            {t("jars.bonus")}
          </button>
          {(() => {
            const balance = options.find((o) => o.id === bonusJar)?.balance ?? 0;
            return balance > 0 ? (
              <button className="text-xs text-muted underline hover:text-ink" onClick={() => setBonus(String(Math.round(balance * 10) / 100))}>
                {t("jars.interestHint")}
              </button>
            ) : null;
          })()}
        </div>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}

      <button className="btn-ghost -ml-2 px-2 py-1 text-xs" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? t("jars.hideHistory") : t("jars.showHistory")}
      </button>
      {showHistory && (
        <ul className="space-y-1 text-xs">
          {jars.entries.map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="w-16 shrink-0 text-muted">{new Date(e.created_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}</span>
              <span className="flex-1">{t(KIND_LABEL[e.kind] ?? "jars.kindAdjust")} · {e.jar_name ?? spendName}{e.note ? ` – ${e.note}` : ""}</span>
              <span className={e.amount < 0 ? "text-red-700" : "text-green-700"}>{e.amount > 0 ? "+" : ""}{m(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
