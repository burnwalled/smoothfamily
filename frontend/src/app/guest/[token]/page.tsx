"use client";

// A babysitter's or grandparent's guest link: the emergency cards, the next days of the calendar
// and the lists the family picked – nothing else, no account. The last answer is kept in this
// browser so the cards can be read without a connection; it is removed when the link stops working.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WifiOff } from "lucide-react";
import { GuestView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import GuestBody from "@/components/guest/GuestBody";

const cacheKey = (token: string) => `sf.guest:${token}`;

export default function GuestPage() {
  const { token } = useParams<{ token: string }>();
  const { t, locale, dateLocale } = useI18n();
  const [view, setView] = useState<GuestView | null>(null);
  const [offline, setOffline] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await fetch(`/api/guest/${token}?lang=${locale}`, { cache: "no-store" });
      if (resp.status === 404) {
        setInvalid(true);
        try {
          localStorage.removeItem(cacheKey(token));
        } catch {}
        return;
      }
      if (!resp.ok) throw new Error(String(resp.status));
      const data = (await resp.json()) as GuestView;
      setView(data);
      setOffline(false);
      try {
        localStorage.setItem(cacheKey(token), JSON.stringify(data));
      } catch {}
    } catch {
      // No connection: show what this browser saw last.
      try {
        const saved = localStorage.getItem(cacheKey(token));
        if (saved) {
          setView(JSON.parse(saved));
          setOffline(true);
        }
      } catch {}
    }
  }, [token, locale]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function tick(itemId: string, done: boolean) {
    setView((v) => v && { ...v, lists: v.lists.map((l) => ({ ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, done } : i)) })) });
    await fetch(`/api/guest/${token}/items/${itemId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) }).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-base px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {invalid ? (
          <div className="card p-6 text-center">
            <h1 className="text-lg font-bold">{t("invite.invalidTitle")}</h1>
            <p className="mt-2 text-sm text-muted">{t("guests.invalid")}</p>
          </div>
        ) : !view ? (
          <p className="text-center text-sm text-muted">{t("common.loading")}</p>
        ) : (
          <>
            <header>
              <h1 className="text-2xl font-extrabold tracking-tight">{t("guests.hello", { name: view.name })}</h1>
              <p className="text-sm text-muted">
                {t("guests.from", { family: view.family_name, when: new Date(view.expires_at).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
              </p>
              {offline && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <WifiOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t("guests.offline")}
                </p>
              )}
            </header>

            <GuestBody view={view} offline={offline} tick={tick} />
            <p className="text-center text-xs text-muted">{t("guests.footer")}</p>
          </>
        )}
      </div>
    </div>
  );
}
