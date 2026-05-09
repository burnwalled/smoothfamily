"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { Plus, Send, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type FamilyMember = {
  user_id: string;
  email: string;
  role: string;
};

type FamilyOverview = {
  family_id: string;
  current_user_role: string;
  members: FamilyMember[];
};

type ChatGroup = {
  id: string;
  family_id: string;
  name: string;
  description: string | null;
  created_by_user_id: string;
  member_user_ids: string[];
  created_at: string;
  updated_at: string;
};

type ChatGroupsResponse = {
  groups: ChatGroup[];
};

type ChatMessage = {
  id: string;
  family_id: string;
  group_id: string;
  sender_user_id: string;
  sender_email: string;
  content: string;
  created_at: string;
};

type ChatMessagesResponse = {
  messages: ChatMessage[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function resolveApiUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  try {
    const parsed = new URL(rawValue);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawValue;
  }
}

function getInitials(email: string): string {
  return email.charAt(0).toUpperCase();
}

function getSenderName(email: string): string {
  return email.split("@")[0];
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Nu";
  if (diffMins < 60) return `${diffMins} min`;
  if (diffMs < 86_400_000) {
    return new Intl.DateTimeFormat("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toggleMember(list: string[], memberId: string): string[] {
  return list.includes(memberId)
    ? list.filter((id) => id !== memberId)
    : [...list, memberId];
}

export default function ChatPage() {
  const t = useTranslations("chat");
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const canManageGroups = useMemo(() => {
    const role = overview?.current_user_role;
    return role === "owner" || role === "parent";
  }, [overview?.current_user_role]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  useEffect(() => {
    setGroupMemberIds(selectedGroup?.member_user_ids ?? []);
    setShowGroupSettings(false);
  }, [selectedGroup?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = useCallback(
    async (groupId: string, silent = false): Promise<void> => {
      if (!overview || !apiUrl) return;
      if (!silent) setMessagesLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          setError(t("errors.auth"));
          return;
        }

        const [msgResponse] = await Promise.all([
          fetch(
            `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${groupId}/messages?limit=100`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
          ),
          fetch(
            `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${groupId}/read`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } },
          ),
        ]);

        if (!msgResponse.ok) {
          if (!silent) setError(t("errors.load"));
          return;
        }

        const payload = (await msgResponse.json()) as ChatMessagesResponse;
        setMessages(payload.messages);
      } catch (err) {
        if (!silent) {
          const detail = err instanceof Error ? ` (${err.message})` : "";
          setError(`${t("errors.network")}${detail}`);
        }
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [apiUrl, getToken, overview, t],
  );

  async function loadOverviewAndGroups(): Promise<void> {
    if (!apiUrl || !isSignedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const overviewResponse = await fetch(
        `${apiUrl}/api/v1/families/current/overview`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!overviewResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const overviewPayload = (await overviewResponse.json()) as FamilyOverview;
      setOverview(overviewPayload);
      setNewGroupMemberIds(overviewPayload.members.map((m) => m.user_id));

      const groupsResponse = await fetch(
        `${apiUrl}/api/v1/families/${overviewPayload.family_id}/chat/groups`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!groupsResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const groupsPayload = (await groupsResponse.json()) as ChatGroupsResponse;
      setGroups(groupsPayload.groups);
      if (groupsPayload.groups.length > 0) {
        setSelectedGroupId((cur) => cur ?? groupsPayload.groups[0].id);
      } else {
        setSelectedGroupId(null);
      }
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverviewAndGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, isSignedIn]);

  useEffect(() => {
    if (selectedGroupId) {
      void loadMessages(selectedGroupId);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const interval = setInterval(() => {
      void loadMessages(selectedGroupId, true);
    }, 8000);
    return () => clearInterval(interval);
  }, [selectedGroupId, loadMessages]);

  async function onCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !apiUrl || !canManageGroups) return;

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newGroupName.trim(),
            description: newGroupDescription.trim() || null,
            member_user_ids: newGroupMemberIds,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        return;
      }

      const created = (await response.json()) as ChatGroup;
      setGroups((prev) => [...prev, created]);
      setSelectedGroupId(created.id);
      setNewGroupName("");
      setNewGroupDescription("");
      setShowCreateGroup(false);
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onUpdateMembers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !apiUrl || !selectedGroup || !canManageGroups) return;

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${selectedGroup.id}/members`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ member_user_ids: groupMemberIds }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        return;
      }

      const updated = (await response.json()) as ChatGroup;
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setShowGroupSettings(false);
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = newMessage.trim();
    if (!overview || !apiUrl || !selectedGroup || !content || sendingMessage) return;

    setSendingMessage(true);
    setNewMessage("");

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        setSendingMessage(false);
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${selectedGroup.id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        setNewMessage(content);
        return;
      }

      const created = (await response.json()) as ChatMessage;
      setMessages((prev) => [...prev, created]);

      void fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${selectedGroup.id}/read`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : "";
      setError(`${t("errors.network")}${detail}`);
      setNewMessage(content);
    } finally {
      setSendingMessage(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.closest("form");
      if (form) form.requestSubmit();
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="portal-card">
        <p className="text-sm text-destructive">{error ?? t("errors.load")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col gap-3">
      {/* Compact header */}
      <section className="portal-card flex items-center justify-between py-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </section>

      {/* Main chat layout */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[260px_1fr]">
        {/* Group sidebar */}
        <aside className="portal-card flex flex-col overflow-hidden">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("groupsTitle")}</h2>
            {canManageGroups && (
              <button
                type="button"
                onClick={() => setShowCreateGroup((v) => !v)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {showCreateGroup ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Create group form */}
          {showCreateGroup && canManageGroups && (
            <form
              onSubmit={onCreateGroup}
              className="mb-3 space-y-2 rounded-lg bg-muted/60 p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {t("groupCreateTitle")}
              </p>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t("fields.groupName")}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
                required
              />
              <input
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder={t("fields.groupDescription")}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
              />
              <div className="space-y-1.5">
                {overview.members.map((member) => (
                  <label
                    key={`new-${member.user_id}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={newGroupMemberIds.includes(member.user_id)}
                      onChange={() =>
                        setNewGroupMemberIds((prev) =>
                          toggleMember(prev, member.user_id),
                        )
                      }
                    />
                    <span className="truncate">{getSenderName(member.email)}</span>
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
              >
                {t("createGroup")}
              </button>
            </form>
          )}

          {/* Group list */}
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("emptyGroups")}</p>
          ) : (
            <ul className="flex-1 space-y-0.5 overflow-y-auto">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      group.id === selectedGroupId
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{group.name}</p>
                      <p className="truncate text-xs opacity-60">
                        {group.member_user_ids.length} {t("membersLabel")}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Messages panel */}
        <article className="portal-card flex min-h-0 flex-col overflow-hidden">
          {!selectedGroup ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("selectGroup")}</p>
            </div>
          ) : (
            <>
              {/* Group header */}
              <div className="mb-3 flex items-start justify-between border-b pb-3">
                <div>
                  <h2 className="font-semibold">{selectedGroup.name}</h2>
                  {selectedGroup.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedGroup.description}
                    </p>
                  )}
                </div>
                {canManageGroups && (
                  <button
                    type="button"
                    onClick={() => setShowGroupSettings((v) => !v)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                      showGroupSettings
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Group settings panel */}
              {showGroupSettings && canManageGroups && (
                <form
                  onSubmit={onUpdateMembers}
                  className="mb-3 space-y-2 rounded-lg bg-muted/60 p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("manageMembersTitle")}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {overview.members.map((member) => (
                      <label
                        key={`edit-${member.user_id}`}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={groupMemberIds.includes(member.user_id)}
                          onChange={() =>
                            setGroupMemberIds((prev) =>
                              toggleMember(prev, member.user_id),
                            )
                          }
                        />
                        <span className="truncate">{getSenderName(member.email)}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    {t("saveMembers")}
                  </button>
                </form>
              )}

              {/* Message list */}
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {messagesLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">{t("loading")}</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                      {t("emptyMessages")}
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((message, index) => {
                      const isOwn = message.sender_email === currentUserEmail;
                      const prevMsg = messages[index - 1];
                      const isSameSender =
                        prevMsg?.sender_user_id === message.sender_user_id;

                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex items-end gap-2",
                            isOwn ? "flex-row-reverse" : "flex-row",
                            isSameSender ? "mt-0.5" : "mt-4",
                          )}
                        >
                          {/* Avatar (others only) */}
                          {!isOwn && (
                            <div
                              className={cn(
                                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                isSameSender
                                  ? "invisible"
                                  : "bg-accent text-accent-foreground",
                              )}
                            >
                              {getInitials(message.sender_email)}
                            </div>
                          )}

                          <div
                            className={cn(
                              "flex max-w-[72%] flex-col gap-0.5",
                              isOwn ? "items-end" : "items-start",
                            )}
                          >
                            {/* Sender name (first in group) */}
                            {!isSameSender && (
                              <p className="px-1 text-xs text-muted-foreground">
                                {isOwn
                                  ? t("you")
                                  : getSenderName(message.sender_email)}
                              </p>
                            )}

                            {/* Bubble */}
                            <div
                              className={cn(
                                "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                                isOwn
                                  ? "rounded-tr-sm bg-primary text-primary-foreground"
                                  : "rounded-tl-sm bg-muted text-foreground",
                              )}
                            >
                              {message.content}
                            </div>

                            {/* Timestamp */}
                            <p className="px-1 text-[10px] text-muted-foreground/60">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} className="h-2" />
                  </>
                )}
              </div>

              {/* Send form */}
              <form
                onSubmit={onSendMessage}
                className="mt-3 flex items-end gap-2 border-t pt-3"
              >
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("fields.message")}
                  className="flex-1 resize-none overflow-auto rounded-xl border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
                  rows={1}
                  maxLength={4000}
                  style={{ maxHeight: "7rem" }}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sendingMessage}
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors",
                    newMessage.trim() && !sendingMessage
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
