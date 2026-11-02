"use client";

// Reward shop: spend your own points on rewards the adults have set up. A purchase waits for an
// adult (the points are held meanwhile); adults buying for themselves need no approval.
import { useState } from "react";
import { Check, Store, Trash2, X } from "lucide-react";
import { api, ShopItem, ShopPurchase, ShopWallet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";

type ItemForm = { title: string; description: string; price: string; limitCount: string; limitPeriod: "" | "week" | "month" };
const EMPTY: ItemForm = { title: "", description: "", price: "", limitCount: "", limitPeriod: "" };

export default function ShopPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const isAdult = me.role !== "child";
  // From the cache: a purchase here, or points earned elsewhere (tasks are RELATED to shop), refresh it.
  const items = useApi<ShopItem[]>("/api/shop/items").data ?? NONE;
  const wallet = useApi<ShopWallet>("/api/shop/me").data ?? null;
  const purchases = useApi<ShopPurchase[]>(isAdult ? "/api/shop/purchases" : null).data ?? NONE;
  const [form, setForm] = useState<ItemForm>(EMPTY);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");


  async function run(action: () => Promise<unknown>, done?: string) {
    setError("");
    setMessage("");
    try {
      await action();
      if (done) setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function addItem() {
    await run(async () => {
      await api.post("/api/shop/items", {
        title: form.title.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        limit_count: form.limitPeriod && form.limitCount ? Number(form.limitCount) : null,
        limit_period: form.limitPeriod && form.limitCount ? form.limitPeriod : null,
      });
      setForm(EMPTY);
    });
  }

  const statusLabel = (s: ShopPurchase["status"]) =>
    s === "pending" ? t("shop.statusPending") : s === "approved" ? t("shop.statusApproved") : t("shop.statusRejected");
  const statusClass = (s: ShopPurchase["status"]) =>
    s === "pending" ? "bg-amber-100 text-amber-900" : s === "approved" ? "bg-green-100 text-green-800" : "bg-base text-muted";
  const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  const limitText = (i: ShopItem) =>
    i.limit_count === null
      ? null
      : t(i.limit_period === "week" ? "shop.leftWeek" : "shop.leftMonth", { n: i.left_this_period ?? 0, max: i.limit_count });

  const pending = purchases.filter((p) => p.status === "pending");
  const history = purchases.filter((p) => p.status !== "pending").slice(0, 20);
  const shown = items.filter((i) => i.active);

  return (
    <>
      <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Store className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
        {t("nav.shop")}
      </h1>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}

      {wallet && (
        <section className="card mt-6 flex flex-wrap items-end justify-between gap-3 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("shop.balance")}</p>
            <p className="text-3xl font-extrabold">{t("shop.points", { n: wallet.balance })}</p>
          </div>
          <p className="text-xs text-muted">
            {t("shop.walletDetail", { earned: wallet.earned, spent: wallet.spent })}
            {wallet.held > 0 ? ` · ${t("shop.held", { n: wallet.held })}` : ""}
          </p>
        </section>
      )}

      {isAdult && pending.length > 0 && (
        <section className="card mt-4 border-accent p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("shop.toApprove")}</h2>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-edge p-3 text-sm">
                <span>
                  <span className="font-semibold">{p.user_name}</span> · {p.title}
                  <span className="text-muted"> · {t("shop.points", { n: p.price })}</span>
                </span>
                <span className="flex gap-2">
                  <button className="btn-primary px-3 py-1 text-xs" onClick={() => run(() => api.post(`/api/shop/purchases/${p.id}`, { action: "approve" }))}>
                    <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {t("tasks.approve")}
                  </button>
                  <button className="rounded border border-red-300 px-3 py-1 text-xs text-red-700" onClick={() => run(() => api.post(`/api/shop/purchases/${p.id}`, { action: "reject" }))}>
                    <X className="mr-1 inline h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    {t("tasks.reject")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{isAdult ? t("shop.emptyAdult") : t("shop.empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shown.map((item) => {
              const affordable = (wallet?.balance ?? 0) >= item.price;
              const left = item.left_this_period;
              return (
                <li key={item.id} className="card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{item.title}</h3>
                    <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-bold">{t("shop.points", { n: item.price })}</span>
                  </div>
                  {item.description && <p className="mt-1 text-sm text-muted">{item.description}</p>}
                  {limitText(item) && <p className="mt-1 text-xs text-muted">{limitText(item)}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <button
                      className="btn-accent"
                      disabled={!affordable || left === 0}
                      onClick={() => run(() => api.post(`/api/shop/items/${item.id}/buy`), isAdult ? t("shop.boughtAdult") : t("shop.bought"))}
                    >
                      {left === 0 ? t("shop.limitReached") : affordable ? t("shop.buy") : t("shop.notEnough", { n: item.price - (wallet?.balance ?? 0) })}
                    </button>
                    {isAdult && (
                      <button
                        className="text-muted hover:text-red-700"
                        onClick={() => confirm(t("common.confirmRemove", { name: item.title })) && run(() => api.del(`/api/shop/items/${item.id}`))}
                        aria-label={t("common.remove")}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {wallet && wallet.purchases.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("shop.myPurchases")}</h2>
          <ul className="space-y-1.5">
            {wallet.purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-14 shrink-0 text-xs text-muted">{day(p.created_at)}</span>
                <span className="min-w-0 flex-1">{p.title}{p.note ? <span className="text-muted"> – {p.note}</span> : null}</span>
                <span className="text-xs text-muted">{t("shop.points", { n: p.price })}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(p.status)}`}>{statusLabel(p.status)}</span>
                {p.status === "pending" && (
                  <button className="text-xs text-muted underline hover:text-ink" onClick={() => run(() => api.post(`/api/shop/purchases/${p.id}/cancel`))}>
                    {t("common.cancel")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdult && (
        <section className="card mt-6 p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("shop.newReward")}</h2>
          <p className="mb-3 text-xs text-muted">{t("shop.newRewardHint")}</p>
          <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
            <input className="input" placeholder={t("shop.titlePh")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input className="input" inputMode="numeric" placeholder={t("shop.pricePh")} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })} />
            <input className="input md:col-span-2" placeholder={t("shop.descriptionPh")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex gap-2 md:col-span-2">
              <input className="input w-24" inputMode="numeric" placeholder={t("shop.limitPh")} value={form.limitCount} onChange={(e) => setForm({ ...form, limitCount: e.target.value.replace(/\D/g, "") })} aria-label={t("shop.limitPh")} />
              <select className="input" value={form.limitPeriod} onChange={(e) => setForm({ ...form, limitPeriod: e.target.value as ItemForm["limitPeriod"] })} aria-label={t("shop.limitPeriod")}>
                <option value="">{t("shop.noLimit")}</option>
                <option value="week">{t("shop.perWeek")}</option>
                <option value="month">{t("shop.perMonth")}</option>
              </select>
              <button className="btn-primary shrink-0" onClick={addItem} disabled={!form.title.trim() || !Number(form.price)}>
                {t("common.add")}
              </button>
            </div>
          </div>
          {history.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{t("shop.history")}</h3>
              <ul className="space-y-1 text-sm">
                {history.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-2">
                    <span className="w-14 shrink-0 text-xs text-muted">{day(p.created_at)}</span>
                    <span className="flex-1">{p.user_name} · {p.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(p.status)}`}>{statusLabel(p.status)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
