"use client";

// Chat (a nicer look in 2.8.2): conversations with avatars, grouped bubbles, a growing message field.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, ChatConversation, ChatMessage, ChatMessagesPage, GifResult, MediaItem, Member, uploadFile } from "@/lib/api";
import { toLocalDateKey } from "@/lib/dateKey";
import { useI18n } from "@/lib/i18n";
import { House, ImagePlus, Lock, LogOut, MessageCircle, Search, SendHorizontal, Smile, SquarePen, Users, X } from "lucide-react";
import { useMe } from "@/components/Shell";
import { useLive, useLiveConnected } from "@/lib/live";
import PageTitle from "@/components/PageTitle";

// Lightweight emoji picker data
const EMOJI_ROWS: string[][] = [
  ["😀","😂","😍","🥰","😎","🤔","😢","😡","🤗","🥳"],
  ["👍","👎","❤️","🔥","✨","🎉","👏","💪","🙌","🤝"],
  ["🍕","🍔","🍣","🍩","🎂","🍎","🍓","🥑","🌮","🍜"],
  ["🐶","🐱","🐭","🐰","🦊","🐻","🐼","🐨","🦁","🐸"],
  ["⭐","🌟","💫","🌈","☀️","🌙","❄️","🌊","🌺","🌻"],
];

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute bottom-full left-0 z-30 mb-2 rounded-2xl border border-edge bg-surface p-2 shadow-soft">
      {EMOJI_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((em) => (
            <button
              key={em}
              className="rounded-lg p-1 text-xl hover:bg-base"
              onClick={() => { onPick(em); onClose(); }}
            >
              {em}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// GIF search through the backend proxy (the browser never contacts GIPHY).
function GifPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      const resp = await api.get<{ gifs: GifResult[] }>(`/api/chat/gifs?q=${encodeURIComponent(query.trim())}`);
      setResults(resp.gifs);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,100%)] rounded-2xl border border-edge bg-surface p-2 shadow-soft">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          className="input flex-1 py-1.5 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("chat.gifSearchPh")}
          autoFocus
        />
        <button className="btn-ghost shrink-0 px-2" type="submit" aria-label={t("chat.gifSearch")} disabled={busy}>
          <Search className="h-4 w-4" strokeWidth={2} />
        </button>
      </form>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
        {busy && <p className="col-span-3 py-4 text-center text-xs text-muted">{t("common.loading")}</p>}
        {failed && <p className="col-span-3 py-4 text-center text-xs text-red-700">{t("chat.gifError")}</p>}
        {!busy && results?.length === 0 && <p className="col-span-3 py-4 text-center text-xs text-muted">{t("chat.gifNoResults")}</p>}
        {!busy &&
          results?.map((gif) => (
            <button key={gif.id} type="button" className="overflow-hidden rounded hover:opacity-80" onClick={() => onPick(gif.id)}>
              <img src={gif.url} alt="" loading="lazy" className="h-20 w-full object-cover" />
            </button>
          ))}
      </div>
      <p className="mt-2 text-[10px] text-muted">{t("chat.gifPrivacy")}</p>
    </div>
  );
}

function dayKey(ts: string): string {
  return toLocalDateKey(new Date(ts));
}

export default function ChatPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [members, setMembers] = useState<Member[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activePeer, setActivePeer] = useState<string>("family");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [gifEnabled, setGifEnabled] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  // The message field grows with what is written (up to a few lines).
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [newConvName, setNewConvName] = useState("");
  const [newConvMembers, setNewConvMembers] = useState<Set<string>>(new Set());
  // The thread scrolls inside its box and follows the newest message while you are at the bottom;
  // scrolled up to read history, it stays put. Loading older messages keeps your place.
  const listRef = useRef<HTMLDivElement>(null);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const olderLoaded = useRef(false);
  // Phones: the thread box ends right above the bottom menu (or the keyboard) so the
  // message field is always visible. Desktop sizes it with CSS.
  const [threadEl, setThreadEl] = useState<HTMLElement | null>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((row) => row.peer_key === activePeer) || null,
    [conversations, activePeer]
  );

  const loadConversations = useCallback(async () => {
    const rows = await api.live<ChatConversation[]>("/api/chat/conversations", setConversations);
    if (!rows.some((row) => row.peer_key === activePeer)) {
      setActivePeer(rows[0]?.peer_key || "family");
    }
  }, [activePeer]);

  const loadMessages = useCallback(
    async (peer: string, before?: string, appendOlder?: boolean) => {
      const query = before ? `?peer=${encodeURIComponent(peer)}&before=${encodeURIComponent(before)}` : `?peer=${encodeURIComponent(peer)}`;
      if (appendOlder) {
        const page = await api.get<ChatMessagesPage>(`/api/chat/messages${query}`);
        olderLoaded.current = true;
        setNextBefore(page.next_before);
        setMessages((prev) => [...page.items, ...prev]);
        return;
      }
      // A refresh brings the newest page (cached first); keep older messages already loaded above it.
      await api.live<ChatMessagesPage>(`/api/chat/messages${query}`, (page) => {
        if (!olderLoaded.current) setNextBefore(page.next_before);
        setMessages((prev) => {
          const first = page.items[0];
          if (!olderLoaded.current || !first) return page.items;
          return [...prev.filter((m) => m.created_at < first.created_at), ...page.items];
        });
      });
    },
    []
  );

  const markRead = useCallback(async (peer: string) => {
    await api.post("/api/chat/read", { peer });
  }, []);

  useEffect(() => {
    api.live<Member[]>("/api/family/members", setMembers).catch(() => {});
    api.live<{ enabled: boolean }>("/api/chat/gifs/status", (r) => setGifEnabled(r.enabled)).catch(() => {});
  }, []);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [body]);

  const live = useLiveConnected();
  const pendingPreview = useMemo(() => (pendingImage ? URL.createObjectURL(pendingImage) : null), [pendingImage]);
  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  useEffect(() => {
    loadConversations().catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
    const timer = window.setInterval(() => {
      loadConversations().catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadConversations, t]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !contentEl) return;
    // Fires when the thread first shows and when images grow it: stay at the bottom.
    const observer = new ResizeObserver(() => {
      if (atBottom.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [contentEl]);

  useEffect(() => {
    if (!threadEl) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const vv = window.visualViewport;
    const update = () => {
      if (desktop.matches) {
        setFitHeight(null);
        return;
      }
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const nav = document.querySelector<HTMLElement>("[data-mobile-nav]");
      const navTop = nav ? nav.getBoundingClientRect().top : viewBottom;
      const top = threadEl.getBoundingClientRect().top;
      setFitHeight(Math.max(240, Math.floor(Math.min(viewBottom, navTop) - top - 12)));
    };
    update();
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    desktop.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      desktop.removeEventListener("change", update);
    };
    // The conversations above it load later and change where it starts.
  }, [threadEl, showNewConv, error, conversations.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const anchor = olderAnchor.current;
    if (anchor) {
      list.scrollTop = list.scrollHeight - anchor.height + anchor.top;
      olderAnchor.current = null;
    } else if (atBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    setError("");
    setMessages([]);
    atBottom.current = true;
    olderLoaded.current = false;
    loadMessages(activePeer)
      .then(() => markRead(activePeer))
      .then(() => loadConversations())
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));

    const timer = window.setInterval(() => {
      loadMessages(activePeer)
        .then(() => markRead(activePeer))
        .then(() => loadConversations())
        .catch(() => {});
    }, live ? 30_000 : 5000);

    return () => window.clearInterval(timer);
  }, [activePeer, loadConversations, loadMessages, markRead, t, live]);

  useLive(["chat"], () => {
    loadMessages(activePeer)
      .then(() => markRead(activePeer))
      .then(() => loadConversations())
      .catch(() => {});
  });

  async function postMessage(payload: { body?: string; media_id?: string; gif_id?: string }) {
    await api.post("/api/chat/messages", { peer: activePeer, ...payload });
    atBottom.current = true;
    // Refreshed in the background, so the next message can be written and sent at once.
    loadMessages(activePeer)
      .then(() => markRead(activePeer))
      .then(() => loadConversations())
      .catch(() => {});
  }

  async function sendMessage() {
    if ((!body.trim() && !pendingImage) || sending) return;
    setError("");
    setSending(true);
    // The field empties at once; on a failure what was written comes back.
    const text = body.trim();
    const image = pendingImage;
    setBody("");
    setPendingImage(null);
    try {
      let mediaId: string | undefined;
      if (image) {
        const convId = activeConversation?.conversation_id;
        if (!convId) throw new Error(t("common.error"));
        const media = await uploadFile<MediaItem>(`/api/chat/conversations/${convId}/attachments`, image);
        mediaId = media.id;
      }
      await postMessage({ body: text, media_id: mediaId });
    } catch (e) {
      setBody((now) => now || text);
      setPendingImage((now) => now ?? image);
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSending(false);
    }
  }

  async function sendGif(gifId: string) {
    setShowGif(false);
    setError("");
    try {
      await postMessage({ gif_id: gifId });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function loadOlder() {
    if (!nextBefore) return;
    const list = listRef.current;
    if (list) olderAnchor.current = { height: list.scrollHeight, top: list.scrollTop };
    try {
      await loadMessages(activePeer, nextBefore, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function createConversation() {
    const memberIds = [...newConvMembers];
    if (!me) return;
    if (!memberIds.includes(me.id)) memberIds.push(me.id);
    try {
      const conv = await api.post<ChatConversation>("/api/chat/conversations", {
        name: newConvName.trim() || null,
        member_ids: memberIds,
      });
      setShowNewConv(false);
      setNewConvName("");
      setNewConvMembers(new Set());
      await loadConversations();
      setActivePeer(conv.peer_key);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function leaveConversation(peer: string) {
    const conv = conversations.find((c) => c.peer_key === peer);
    if (!conv?.conversation_id) return;
    try {
      await api.post(`/api/chat/conversations/${conv.conversation_id}/leave`, {});
      await loadConversations();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const displayName = (conv: ChatConversation) => {
    if (isFamily(conv)) return t("chat.family");
    if (conv.peer_type === "dm") return conv.peer_name;
    return conv.conversation_name || conv.peer_name || t("chat.groupChat");
  };
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  // Who else is in the open chat: "Anna, Leo and Bo".
  const whoIsIn = (conv: ChatConversation | null) => {
    if (!conv || isFamily(conv)) return t("chat.everyone");
    const names = conv.member_ids.filter((id) => id !== me?.id).map((id) => memberById.get(id)?.display_name).filter(Boolean);
    return names.join(", ");
  };
  const shortTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return dayKey(iso) === toLocalDateKey(new Date())
      ? d.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageTitle title={t("chat.title")} />
        <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={() => setShowNewConv((v) => !v)} aria-label={t("chat.newConversation")} title={t("chat.newConversation")}>
          <SquarePen className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("chat.newConversation")}</span>
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      {showNewConv && (
        <div className="card mt-4 space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("chat.newConversation")}</h2>
          <input className="input" placeholder={t("chat.conversationName")} value={newConvName} onChange={(e) => setNewConvName(e.target.value)} />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("chat.selectMembers")}</p>
            <div className="flex flex-wrap gap-2">
              {members
                .filter((m) => m.id !== me?.id)
                .map((m) => {
                  const on = newConvMembers.has(m.id);
                  return (
                    <label key={m.id} className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? "border-accent bg-accent-soft" : "border-edge"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => {
                          setNewConvMembers((prev) => {
                            const next = new Set(prev);
                            next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                            return next;
                          });
                        }}
                      />
                      <Avatar name={m.display_name} color={m.color} size="sm" />
                      {m.display_name}
                    </label>
                  );
                })}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createConversation} disabled={newConvMembers.size === 0}>
              {t("chat.createConversation")}
            </button>
            <button className="btn-ghost" onClick={() => setShowNewConv(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:h-[calc(100dvh-12rem)] md:min-h-[360px] md:grid-cols-[300px_1fr]">
        <section className="md:min-h-0 md:overflow-y-auto md:rounded-card md:border md:border-edge md:bg-surface md:p-2 md:shadow-sm" aria-label={t("chat.conversations")}>
          <ul className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1 md:mx-0 md:pt-0 md:block md:space-y-0.5 md:overflow-visible md:px-0 md:pb-0">
            {conversations.map((row) => {
              const active = activePeer === row.peer_key;
              return (
                <li key={row.peer_key} className="shrink-0 md:shrink">
                  <button
                    className={`group flex flex-col items-center gap-1 rounded-xl text-center md:w-full md:flex-row md:gap-3 md:px-2 md:py-2 md:text-left ${active ? "md:bg-accent-soft" : "md:hover:bg-base"}`}
                    onClick={() => setActivePeer(row.peer_key)}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className={`relative rounded-full ${active ? "ring-2 ring-accent ring-offset-2 ring-offset-base md:ring-0 md:ring-offset-0" : ""}`}>
                      <ConversationAvatar conv={row} name={displayName(row)} />
                      {row.unread_count > 0 && (
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white md:hidden">{row.unread_count}</span>
                      )}
                    </span>
                    <span className="w-16 truncate text-xs font-semibold md:hidden">{displayName(row)}</span>
                    <span className="hidden min-w-0 flex-1 md:block">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate ${row.unread_count > 0 ? "font-bold" : "font-semibold"}`}>{displayName(row)}</span>
                        <span className="shrink-0 text-[11px] text-muted">{shortTime(row.last_message_at)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-xs ${row.unread_count > 0 ? "text-ink" : "text-muted"}`}>{row.last_message_snippet || t("chat.noMessages")}</span>
                        {row.unread_count > 0 && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{row.unread_count}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          ref={setThreadEl}
          className="card flex h-[calc(100dvh-11rem)] flex-col overflow-hidden p-0 md:h-auto md:min-h-0"
          style={fitHeight !== null ? { height: fitHeight } : undefined}
        >
          <header className="flex items-center gap-3 border-b border-edge px-4 py-3">
            {activeConversation && <ConversationAvatar conv={activeConversation} name={displayName(activeConversation)} />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold leading-tight">{activeConversation ? displayName(activeConversation) : t("chat.family")}</h2>
              <p className="truncate text-xs text-muted">{whoIsIn(activeConversation)}</p>
            </div>
            <span className="hidden items-center gap-1 text-[11px] text-muted md:flex" title={t("chat.localNotice")}>
              <Lock className="h-3 w-3" aria-hidden />
              {t("chat.private")}
            </span>
            {activeConversation && !isFamily(activeConversation) && (
              <button className="rounded-full p-2 text-muted hover:bg-base hover:text-red-700" onClick={() => leaveConversation(activePeer)} aria-label={t("chat.leaveConversation")} title={t("chat.leaveConversation")}>
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            )}
          </header>

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-base/60 px-3 py-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            <div ref={setContentEl}>
              {nextBefore ? (
                <div className="mb-2 text-center">
                  <button className="rounded-full border border-edge bg-surface px-3 py-1 text-xs text-muted hover:text-ink" onClick={loadOlder}>
                    {t("chat.loadOlder")}
                  </button>
                </div>
              ) : null}

              {messages.length === 0 ? (
                <div className="grid h-40 place-items-center text-center text-sm text-muted">
                  <span>
                    <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                    {t("chat.noMessages")}
                  </span>
                </div>
              ) : null}

              {messages.map((msg, index) => {
                const prev = messages[index - 1];
                const next = messages[index + 1];
                const showDay = !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);
                const mine = me?.id === msg.sender_id;
                // Messages in a row from the same person, close in time, are one group.
                const joinsPrev = !showDay && !!prev && prev.sender_id === msg.sender_id && Date.parse(msg.created_at) - Date.parse(prev.created_at) < GROUP_MS;
                const joinsNext = !!next && next.sender_id === msg.sender_id && dayKey(next.created_at) === dayKey(msg.created_at) && Date.parse(next.created_at) - Date.parse(msg.created_at) < GROUP_MS;
                const emojiOnly = !msg.media_id && !msg.gif_id && isEmojiOnly(msg.body);
                const corner = mine ? (joinsNext ? "rounded-br-md" : "rounded-br-sm") : joinsNext ? "rounded-bl-md" : "rounded-bl-sm";
                const time = new Date(msg.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={msg.id} className={joinsPrev ? "mt-0.5" : "mt-3"}>
                    {showDay ? (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full bg-surface px-3 py-0.5 text-[11px] font-medium capitalize text-muted shadow-sm">
                          {new Date(msg.created_at).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ) : null}
                    <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                      {!mine && <span className="w-7 shrink-0">{!joinsNext && <Avatar name={msg.sender_name} color={msg.sender_color} size="sm" />}</span>}
                      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!mine && !joinsPrev && (
                          <span className="mb-0.5 ml-1 text-[11px] font-semibold" style={{ color: msg.sender_color }}>
                            {msg.sender_name}
                          </span>
                        )}
                        {emojiOnly ? (
                          <p className="text-4xl leading-tight" title={time}>
                            {msg.body}
                          </p>
                        ) : (
                          <div
                            className={`rounded-2xl ${corner} ${msg.media_id || msg.gif_id ? "p-1" : "px-3 py-2"} text-sm shadow-sm ${mine ? "bg-primary-700 text-white" : "bg-surface text-ink"}`}
                            title={time}
                          >
                            {msg.media_id ? (
                              <button type="button" className="block overflow-hidden rounded-xl" onClick={() => setLightbox(`/api/media/${msg.media_id}/web`)} aria-label={t("chat.openImage")}>
                                <img src={`/api/media/${msg.media_id}/thumb`} alt="" loading="lazy" className="max-h-64 w-auto" />
                              </button>
                            ) : null}
                            {msg.gif_id ? <img src={`/api/chat/gifs/${msg.gif_id}.gif`} alt="GIF" loading="lazy" className="max-h-48 rounded-xl" /> : null}
                            {msg.body ? <p className={`whitespace-pre-wrap break-words ${msg.media_id || msg.gif_id ? "px-2 pb-1 pt-1.5" : ""}`}>{msg.body}</p> : null}
                          </div>
                        )}
                        {!joinsNext && <span className={`mt-0.5 text-[10px] text-muted ${mine ? "mr-1" : "ml-1"}`}>{time}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-edge bg-surface px-3 py-2">
            {pendingImage && pendingPreview ? (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-edge bg-base p-2">
                <img src={pendingPreview} alt="" className="h-14 w-14 rounded-lg object-cover" />
                <span className="flex-1 truncate text-sm">{pendingImage.name}</span>
                <button type="button" className="rounded-full p-1 text-muted hover:text-ink" onClick={() => setPendingImage(null)} aria-label={t("common.removeFile")}>
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ) : null}

            <div className="relative flex items-end gap-2">
              {showGif && <GifPicker onPick={sendGif} onClose={() => setShowGif(false)} />}
              {showEmoji && <EmojiPicker onPick={(em) => setBody((prev) => prev + em)} onClose={() => setShowEmoji(false)} />}
              <div className="flex min-h-11 flex-1 items-end gap-0.5 rounded-3xl border border-edge bg-base py-1 pl-1 pr-2 focus-within:border-primary-700">
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" onClick={() => setShowEmoji((v) => !v)} title={t("chat.emoji")} aria-label={t("chat.emoji")} type="button">
                  <Smile className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <textarea
                  ref={bodyRef}
                  rows={1}
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={4000}
                  placeholder={t("chat.messagePh")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                {gifEnabled && (
                  <button className="grid h-9 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-extrabold text-muted hover:bg-surface hover:text-ink" onClick={() => setShowGif((v) => !v)} title={t("chat.gif")} aria-label={t("chat.gif")} type="button">
                    GIF
                  </button>
                )}
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" onClick={() => imageInput.current?.click()} title={t("chat.attachImage")} aria-label={t("chat.attachImage")} type="button">
                  <ImagePlus className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  setPendingImage(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <button
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-700 text-white shadow-sm hover:bg-primary-800 disabled:opacity-40"
                onClick={sendMessage}
                disabled={(!body.trim() && !pendingImage) || sending}
                aria-label={t("chat.send")}
                title={t("chat.send")}
              >
                <SendHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </section>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute right-4 top-4 z-10 text-white" onClick={() => setLightbox(null)} aria-label={t("common.close")}>
            <X className="h-7 w-7" strokeWidth={1.75} />
          </button>
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

// Messages in a row from the same person within this time are shown as one group.
const GROUP_MS = 5 * 60_000;

/** A message of one to three emoji only is shown large. */
function isEmojiOnly(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 16) return false;
  const glyphs = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment).filter((g) => g.trim());
  return glyphs.length > 0 && glyphs.length <= 3 && glyphs.every((g) => /\p{Extended_Pictographic}/u.test(g));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Avatar({ name, color, size = "md" }: { name: string; color: string | null | undefined; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 text-[11px]" : "h-11 w-11 text-sm";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full font-bold text-white`} style={{ backgroundColor: color ?? "#6b7280" }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** The family's own channel (also when the family is only two). */
function isFamily(conv: ChatConversation): boolean {
  return conv.peer_type === "family" || conv.conversation_name === "Family";
}

function ConversationAvatar({ conv, name }: { conv: ChatConversation; name: string }) {
  if (conv.peer_type === "dm" && !isFamily(conv)) return <Avatar name={name} color={conv.peer_color} />;
  const Icon = isFamily(conv) ? House : Users;
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
  );
}
