"use client";

// Two homes: the children's other parents (2.8.3) – invite one per child (those who may change the
// family's settings), see who has joined, close their access, and write with them (all adults).
import { useState } from "react";
import { Copy, MessageCircle, UserRoundPlus } from "lucide-react";
import { api, Member } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";

type CoParent = { id: string; name: string; child_ids: string[]; joined: boolean; last_seen_at: string | null; revoked: boolean; invite_expires_at: string | null };
type Message = { id: string; body: string; from_name: string; mine: boolean; created_at: string };

function Thread({ coparent }: { coparent: CoParent }) {
  const { t, dateLocale } = useI18n();
  // The thread from the cache: a message from the other parent (a live event) refreshes it.
  const path = `/api/custody/coparents/${coparent.id}/messages`;
  const messages = useApi<Message[]>(path).data ?? NONE;
  const [body, setBody] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const next = await api.post<Message[]>(path, { body: body.trim() });
    setApiData<Message[]>(path, () => next);
    setBody("");
  }

  return (
    <div className="mt-2 rounded-lg border border-edge bg-base p-3">
      {messages.length === 0 ? (
        <p className="text-xs text-muted">{t("coparent.noMessages")}</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.mine ? "bg-primary-700 text-white" : "bg-surface"}`}>
                <span className={`block text-[11px] font-semibold ${m.mine ? "text-white/80" : "text-muted"}`}>{m.from_name}</span>
                <span className="whitespace-pre-wrap">{m.body}</span>
                <span className={`block text-[10px] ${m.mine ? "text-white/70" : "text-muted"}`}>
                  {new Date(m.created_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!coparent.revoked && (
        <form className="mt-2 flex gap-2" onSubmit={send}>
          <input className="input flex-1" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} placeholder={t("coparent.writeTo", { name: coparent.name })} aria-label={t("coparent.writeTo", { name: coparent.name })} />
          <button className="btn-primary shrink-0" type="submit" disabled={!body.trim()}>
            {t("chat.send")}
          </button>
        </form>
      )}
    </div>
  );
}

export default function CoParents({ children }: { children: Member[] }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const mayManage = me.role === "admin" || !!me.can_manage_family;
  const rows = useApi<CoParent[]>("/api/custody/coparents").data ?? NONE;
  const [childId, setChildId] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");


  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const made = await api.post<CoParent & { url: string }>(`/api/custody/${childId || children[0]?.id}/coparents`, { name: name.trim() });
      setLink(made.url);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  const childName = (id: string) => children.find((c) => c.id === id)?.display_name ?? "";
  if (children.length === 0) return null;
  return (
    <section className="card p-5" aria-label={t("coparent.title")}>
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <UserRoundPlus className="h-4 w-4" aria-hidden />
        {t("coparent.title")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("coparent.intro")}</p>

      {rows.some((r) => r.child_ids.some((id) => children.some((c) => c.id === id))) && (
        <ul className="divide-y divide-edge">
          {rows.filter((r) => r.child_ids.some((id) => children.some((c) => c.id === id))).map((r) => (
            <li key={r.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted">{r.child_ids.map(childName).join(", ")}</span>
                <span className="text-xs text-muted">
                  · {r.revoked ? t("coparent.closed") : r.joined ? (r.last_seen_at ? t("coparent.lastSeen", { when: new Date(r.last_seen_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t("coparent.joined")) : t("coparent.invited")}
                </span>
                <span className="ml-auto flex gap-1">
                  {r.joined && (
                    <button className="btn-ghost flex items-center gap-1 px-2 py-1 text-xs" onClick={() => setOpen((v) => (v === r.id ? null : r.id))} aria-expanded={open === r.id}>
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      {t("coparent.messages")}
                    </button>
                  )}
                  {mayManage && !r.revoked && (
                    <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-base" onClick={() => confirm(t("coparent.closeConfirm", { name: r.name })) && api.del(`/api/custody/coparents/${r.id}`)}>
                      {t("coparent.close")}
                    </button>
                  )}
                </span>
              </div>
              {open === r.id && <Thread coparent={r} />}
            </li>
          ))}
        </ul>
      )}

      {mayManage && (
        <form className="mt-3 flex flex-wrap items-end gap-2 border-t border-edge pt-3" onSubmit={invite}>
          {children.length > 1 && (
            <label className="text-sm">
              {t("coparent.forChild")}
              <select className="input mt-1" value={childId || children[0].id} onChange={(e) => setChildId(e.target.value)}>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="min-w-40 flex-1 text-sm">
            {t("coparent.theirName")}
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Erik" />
          </label>
          <button className="btn-primary" type="submit" disabled={!name.trim()}>
            {t("coparent.invite")}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {link && (
        <div className="mt-3 space-y-1">
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t("coparent.inviteLink")} />
            <button className="btn-ghost border border-edge" onClick={() => navigator.clipboard?.writeText(link)} aria-label={t("vault.copyLink")}>
              <Copy className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="text-xs text-muted">{t("coparent.inviteLinkHint")}</p>
        </div>
      )}
    </section>
  );
}
