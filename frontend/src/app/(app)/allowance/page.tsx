"use client";

// Allowance: children see what they have earned from approved task points; adults follow how the
// current week/month is going and record payouts. How each child earns it is set in the family's
// settings → Children (components/allowance/AllowanceRates.tsx).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, PiggyBank, Wallet } from "lucide-react";
import { AllowanceMe, AllowanceOverviewItem, AllowancePayout, api, Jars, Me } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import SavingsJars from "@/components/SavingsJars";
import SettingsLink from "@/components/SettingsLink";
import { earningLine, pointsPerUnit } from "@/components/allowance/AllowanceRates";
import { useLive } from "@/lib/live";

function money(value: number, currency: string, locale: string): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function GoalMeter({ points, goal, reached, period }: { points: number; goal: number; reached: boolean; period: "week" | "month" }) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.round((points / goal) * 100));
  const periodLabel = t(period === "month" ? "allowance.periodMonth" : "allowance.periodWeek");
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold">{t("allowance.goalLabel", { period: periodLabel })}</span>
        <span>{points} / {goal}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-edge">
        <div className={`h-full rounded-full ${reached ? "bg-green-600" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        {reached ? t("allowance.goalReached") : t("allowance.goalLeft", { n: goal - points })}
      </p>
    </div>
  );
}

type Earning = AllowanceMe | AllowanceOverviewItem;

function isSetUp(item: Earning): boolean {
  return item.mode === "goal" ? Boolean(item.min_points && item.amount) : pointsPerUnit(item) !== null;
}

// How the current week/month is going: the goal meter, or points and money so far.
function PeriodStatus({ item, forChild = false }: { item: Earning; forChild?: boolean }) {
  const { t, dateLocale } = useI18n();
  if (!isSetUp(item)) return <p className="text-sm text-muted">{forChild ? t("allowance.noRate") : t("allowance.notSetUp")}</p>;
  if (item.mode === "goal" && item.min_points && item.amount) {
    const prize = money(item.amount, item.currency, dateLocale);
    return (
      <div>
        <GoalMeter points={item.period_points} goal={item.min_points} reached={item.period_reached} period={item.period} />
        {!item.period_reached && (
          <p className="mt-1 text-sm">{forChild ? t("allowance.goalWaiting", { amount: prize }) : t("allowance.goalPrize", { amount: prize })}</p>
        )}
      </div>
    );
  }
  const periodLabel = t(item.period === "month" ? "allowance.periodMonth" : "allowance.periodWeek");
  return (
    <div>
      <div className="text-xs font-semibold">{t("allowance.statusTitle", { period: periodLabel })}</div>
      <div className="mt-0.5 text-sm">
        {t("allowance.statusPoints", { points: item.period_points, amount: money(item.period_earned, item.currency, dateLocale) })}
      </div>
    </div>
  );
}

function PayoutList({ payouts, currency }: { payouts: AllowancePayout[]; currency: string }) {
  const { t, dateLocale } = useI18n();
  if (payouts.length === 0) return <p className="text-sm text-muted">{t("allowance.noPayouts")}</p>;
  return (
    <ul className="space-y-1.5">
      {payouts.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0">
            <span className="block">{new Date(p.paid_at).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })}</span>
            {p.note && <span className="block truncate text-xs text-muted">{p.note}</span>}
          </span>
          <span className="shrink-0 font-semibold">−{money(p.amount, currency, dateLocale)}</span>
        </li>
      ))}
    </ul>
  );
}

function ChildView({ me }: { me: Me }) {
  const { t, dateLocale } = useI18n();
  const [data, setData] = useState<AllowanceMe | null>(null);
  const [payouts, setPayouts] = useState<AllowancePayout[]>([]);
  const [jars, setJars] = useState<Jars | null>(null);

  useEffect(() => {
    api.live<AllowanceMe>("/api/allowance/me", setData).catch(() => {});
    api.live<AllowancePayout[]>("/api/allowance/payouts", setPayouts).catch(() => {});
    api.live<Jars>("/api/allowance/jars", setJars).catch(() => {});
  }, [me.id]);

  if (!data) return <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>;
  const ppu = pointsPerUnit(data);
  const periodLabel = t(data.period === "month" ? "allowance.periodMonth" : "allowance.periodWeek");

  return (
    <div className="mt-6 space-y-4">
      <section className="card bg-primary-800 p-6 text-primary-100">
        <div className="text-sm font-semibold uppercase tracking-wide opacity-80">{t("allowance.balance")}</div>
        <div className="mt-1 text-4xl font-extrabold text-white">{money(data.balance, data.currency, dateLocale)}</div>
        <p className="mt-2 text-sm opacity-80">
          {!isSetUp(data)
            ? t("allowance.noRate")
            : data.mode === "goal" && data.min_points && data.amount
              ? t("allowance.goalLine", { points: data.min_points, period: periodLabel, amount: money(data.amount, data.currency, dateLocale) })
              : t("allowance.rateLine", { points: ppu ?? 0, currency: data.currency })}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{t("allowance.statusTitle", { period: periodLabel })}</div>
          <div className="mt-1 text-2xl font-extrabold">{money(data.period_earned, data.currency, dateLocale)}</div>
          <div className="mt-2">
            <PeriodStatus item={data} forChild />
          </div>
        </section>
        <section className="card p-5">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{t("allowance.totalEarned")}</div>
          <div className="mt-1 text-2xl font-extrabold">{money(data.earned_lifetime, data.currency, dateLocale)}</div>
          <div className="text-xs text-muted">{t("allowance.points", { n: data.points_lifetime })}</div>
        </section>
      </div>

      {/* Also without jars: the child can propose a savings goal of their own. */}
      {jars && (
        <section className="card p-5">
          <SavingsJars jars={jars} userId={me.id} isAdult={false} onChanged={setJars} />
        </section>
      )}

      {data.points_pending > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-3 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          {t("allowance.pendingChild", { n: data.points_pending })}
        </p>
      )}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("allowance.payouts")}</h2>
        <PayoutList payouts={payouts} currency={data.currency} />
      </section>
    </div>
  );
}

function ChildCard({ item, onChanged }: { item: AllowanceOverviewItem; onChanged: () => void }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const mayManage = me.role === "admin" || !!me.can_manage_family;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [payouts, setPayouts] = useState<AllowancePayout[]>([]);
  const [message, setMessage] = useState("");
  const [payError, setPayError] = useState("");
  const [jars, setJars] = useState<Jars | null>(null);
  // "" = Spend.
  const [payJar, setPayJar] = useState("");

  useEffect(() => {
    api.live<Jars>(`/api/allowance/jars?user_id=${item.user_id}`, setJars).catch(() => {});
  }, [item.user_id, item.balance]);

  const loadPayouts = useCallback(() => {
    api.live<AllowancePayout[]>(`/api/allowance/payouts?user_id=${item.user_id}`, setPayouts).catch(() => {});
  }, [item.user_id]);

  useEffect(() => {
    if (showHistory) loadPayouts();
  }, [showHistory, loadPayouts]);

  async function pay() {
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setMessage(t("tasks.invalidAmount"));
      return;
    }
    setPayError("");
    try {
      await api.post("/api/allowance/payouts", {
        user_id: item.user_id,
        amount: value,
        note: note.trim() || null,
        jar_id: payJar || null,
      });
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("common.error"));
      return;
    }
    setAmount("");
    setNote("");
    setMessage(t("allowance.paidDone", { amount: money(value, item.currency, dateLocale) }));
    if (showHistory) loadPayouts();
    onChanged();
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.display_name}
        </h2>
        <span className="text-right">
          <span className="block text-xs text-muted">{t("allowance.toPay")}</span>
          <span className="text-2xl font-extrabold">{money(item.balance, item.currency, dateLocale)}</span>
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-edge bg-surface px-4 py-3">
        <PeriodStatus item={item} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {t("allowance.totals", {
          total: money(item.earned_lifetime, item.currency, dateLocale),
          paid: money(item.payouts_total, item.currency, dateLocale),
        })}
      </p>
      {item.points_pending > 0 && (
        <Link href="/tasks?tab=approvals" className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("allowance.pendingAdult", { n: item.points_pending })}
        </Link>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm">{earningLine(item, t)}</p>
          {mayManage && <SettingsLink href="/settings/members" />}
        </div>
        <div>
          <label className="label">{t("allowance.payLabel")}</label>
          <div className="flex gap-2">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={item.balance > 0 ? String(item.balance) : "0"} />
            <button className="btn-accent shrink-0" onClick={pay} disabled={!amount.trim()}>
              <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("allowance.pay")}
            </button>
          </div>
          <input className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("allowance.notePh")} maxLength={500} />
          {jars?.enabled && (
            <select className="input mt-2" value={payJar} onChange={(e) => setPayJar(e.target.value)} aria-label={t("jars.payFrom")}>
              {[{ id: "", name: t("jars.spend"), balance: jars.spend }, ...jars.jars].map((jar) => (
                <option key={jar.id} value={jar.id}>{t("jars.payFromJar", { jar: jar.name, amount: money(jar.balance, item.currency, dateLocale) })}</option>
              ))}
            </select>
          )}
          {payError && <p className="mt-1 text-xs text-red-700">{payError}</p>}
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
      {jars && (
        <div className="mt-4 border-t border-edge pt-4">
          <SavingsJars jars={jars} userId={item.user_id} isAdult onChanged={setJars} />
        </div>
      )}

      <button className="btn-ghost -ml-2 mt-3 px-2 py-1 text-xs" onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? t("allowance.hideHistory") : t("allowance.showHistory")}
      </button>
      {showHistory && (
        <div className="mt-2">
          <PayoutList payouts={payouts} currency={item.currency} />
        </div>
      )}
    </section>
  );
}

function AdultView() {
  const { t } = useI18n();
  const [children, setChildren] = useState<AllowanceOverviewItem[] | null>(null);
  const load = useCallback(() => {
    api.live<AllowanceOverviewItem[]>("/api/allowance/overview", setChildren).catch(() => setChildren([]));
  }, []);
  // Changes made elsewhere in the family show up at once.
  useLive(["allowance"], load);
  useEffect(load, [load]);

  if (!children) return <p className="mt-6 text-sm text-muted">{t("common.loading")}</p>;
  if (children.length === 0) return <p className="mt-6 text-sm text-muted">{t("allowance.noChildren")}</p>;
  return (
    <div className="mt-6 space-y-4">
      {children.map((item) => (
        <ChildCard key={item.user_id} item={item} onChanged={load} />
      ))}
    </div>
  );
}

export default function AllowancePage() {
  const { t } = useI18n();
  const me = useMe();

  return (
    <>
      <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
        <PiggyBank className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
        {t("allowance.title")}
      </h1>
      <p className="mt-1 text-sm text-muted">{me?.role === "child" ? t("allowance.introChild") : t("allowance.introAdult")}</p>
      {me && (me.role === "child" ? <ChildView me={me} /> : <AdultView />)}
    </>
  );
}
