"use client";

// The other parent's page (2.8.3): their own account – not a family member. They see their
// children's schedule between the homes, calendar, emergency card and handover list, and write with
// the family's adults. Nothing is kept in this browser.
import { useCallback, useEffect, useState } from "react";
import { LogOut, Send } from "lucide-react";
import { GuestView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import GuestBody from "@/components/guest/GuestBody";
import CoparentCosts from "@/components/guest/CoparentCosts";

type Message = { id: string; body: string; from_name: string; mine: boolean; created_at: string };
type View = GuestView & { messages: Message[] };

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" as const });

export default function CoParentPage() {
  const { t, locale, dateLocale } = useI18n();
  const [view, setView] = useState<View | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const resp = await fetch(`/api/coparent/me?lang=${locale}`, { cache: "no-store", credentials: "same-origin" }).catch(() => null);
    if (resp?.status === 401) {
      setSignedOut(true);
      setView(null);
      return;
    }
    if (resp?.ok) {
      setView(await resp.json());
      setSignedOut(false);
    }
  }, [locale]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const resp = await fetch("/api/coparent/login", json({ username, password }));
    if (!resp.ok) {
      setError(resp.status === 429 ? t("coparent.tooMany") : t("coparent.wrong"));
      return;
    }
    setPassword("");
    load();
  }

  async function signOut() {
    await fetch("/api/coparent/logout", { method: "POST", credentials: "same-origin" });
    setView(null);
    setSignedOut(true);
  }

  async function tick(itemId: string, done: boolean) {
    setView((v) => v && { ...v, lists: v.lists.map((l) => ({ ...l, items: l.items.map((i) => (i.id === itemId ? { ...i, done } : i)) })) });
    await fetch(`/api/coparent/items/${itemId}`, json({ done })).catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const resp = await fetch("/api/coparent/messages", json({ body: message.trim() }));
    if (resp.ok) {
      const messages = (await resp.json()) as Message[];
      setView((v) => v && { ...v, messages });
      setMessage("");
    }
  }

  return (
    <div className="min-h-screen bg-base px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {signedOut ? (
          <form className="card mx-auto max-w-sm space-y-3 p-6" onSubmit={signIn}>
            <h1 className="text-xl font-bold">{t("coparent.signInTitle")}</h1>
            <p className="text-sm text-muted">{t("coparent.signInHint")}</p>
            <label className="block text-sm">
              {t("coparent.username")}
              <input className="input mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="block text-sm">
              {t("coparent.password")}
              <input className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={!username || !password}>
              {t("coparent.signIn")}
            </button>
          </form>
        ) : !view ? (
          <p className="text-center text-sm text-muted">{t("common.loading")}</p>
        ) : (
          <>
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-extrabold tracking-tight">{t("guests.hello", { name: view.name })}</h1>
                <p className="text-sm text-muted">{t("coparent.from", { family: view.family_name })}</p>
              </div>
              <button className="btn-ghost flex items-center gap-1 text-sm" onClick={signOut}>
                <LogOut className="h-4 w-4" aria-hidden />
                {t("coparent.signOut")}
              </button>
            </header>

            <section className="card p-5" aria-label={t("coparent.messages")}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("coparent.messagesWith", { family: view.family_name })}</h2>
              {view.messages.length === 0 ? (
                <p className="text-sm text-muted">{t("coparent.noMessages")}</p>
              ) : (
                <ul className="space-y-2">
                  {view.messages.map((m) => (
                    <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                      <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "bg-primary-700 text-white" : "bg-base"}`}>
                        {!m.mine && <span className="block text-[11px] font-semibold text-muted">{m.from_name}</span>}
                        <span className="whitespace-pre-wrap">{m.body}</span>
                        <span className={`block text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>
                          {new Date(m.created_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form className="mt-3 flex gap-2" onSubmit={send}>
                <input className="input flex-1" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder={t("coparent.writePh")} aria-label={t("coparent.writePh")} />
                <button className="btn-primary shrink-0" type="submit" disabled={!message.trim()} aria-label={t("chat.send")}>
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              </form>
            </section>

            <CoparentCosts />
            <GuestBody view={view} tick={tick} />
          </>
        )}
      </div>
    </div>
  );
}
