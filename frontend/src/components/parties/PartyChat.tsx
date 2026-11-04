"use client";

// A party's chat (3.4.0), for those without the chat app: the guests on their page and in the portal,
// the helpers in the planner. The same conversation the family has in the chat app.
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { api, request } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Message = { id: string; name: string; body: string; at: string; host: boolean; mine: boolean };
type Props = {
  // Where its messages are; a guest's key or the like goes in the query.
  path: string; query?: string;
  // Who's writing when the server doesn't know: the portal asks for a name.
  askName?: boolean;
  // The hosts and helpers may take a message away.
  remove?: boolean;
  label: string; buttonClass?: string;
};

export default function PartyChat({ path, query = "", askName = false, remove = false, label, buttonClass = "pt-btn" }: Props) {
  const { t, dateLocale } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const load = useCallback(() => {
    request<{ messages: Message[] }>(`${path}${query}`).then((r) => setMessages(r.messages)).catch(() => {});
  }, [path, query]);
  useEffect(() => {
    load();
    const every = setInterval(load, 8000);
    return () => clearInterval(every);
  }, [load]);
  const newest = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [newest]);
  const send = async () => {
    setError("");
    try {
      await api.post(`${path}${query}`, { body: body.trim(), name: name.trim() });
      setBody("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {messages.length === 0 ? <p className="text-sm text-muted">{t("partyChat.empty")}</p> : (
        <ol ref={list} className="max-h-80 space-y-2 overflow-auto pr-1">
          {messages.map((m) => (
            <li key={m.id} className={`flex items-end gap-2 ${m.mine ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-2xl border border-edge px-3 py-1.5 ${m.mine ? "bg-accent-soft" : ""}`}>
                <p className="text-[11px] font-semibold text-muted">{m.name}{m.host ? ` · ${t("partyChat.host")}` : ""} · {new Date(m.at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                <p className="whitespace-pre-line break-words text-sm">{m.body}</p>
              </div>
              {remove && <button type="button" className="text-muted hover:text-red-700" aria-label={t("partyChat.remove", { name: m.name })} onClick={() => { void api.del(`${path}/${m.id}`).then(load); }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>}
            </li>
          ))}
        </ol>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (body.trim() && (!askName || name.trim())) void send(); }}>
        {askName && <label className="w-full sm:w-40"><span className="label">{t("portal.yourName")}</span><input className="input" value={name} maxLength={60} autoComplete="given-name" onChange={(e) => setName(e.target.value)} /></label>}
        <label className="min-w-40 flex-1"><span className="label">{t("partyChat.write")}</span><input className="input" value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} /></label>
        <button className={`${buttonClass} flex items-center gap-1.5`} type="submit" disabled={!body.trim() || (askName && !name.trim())}><Send className="h-4 w-4" aria-hidden />{t("partyChat.send")}</button>
      </form>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
