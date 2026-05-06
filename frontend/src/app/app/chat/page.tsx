"use client";

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

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
  if (!rawValue) {
    return undefined;
  }

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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatPage() {
  const t = useTranslations("chat");
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);

  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [newMessage, setNewMessage] = useState("");

  const canManageGroups = useMemo(() => {
    const role = overview?.current_user_role;
    return role === "owner" || role === "parent";
  }, [overview?.current_user_role]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  useEffect(() => {
    setGroupMemberIds(selectedGroup?.member_user_ids ?? []);
  }, [selectedGroup?.id, selectedGroup?.member_user_ids]);

  function toggleMember(list: string[], memberId: string): string[] {
    if (list.includes(memberId)) {
      return list.filter((id) => id !== memberId);
    }
    return [...list, memberId];
  }

  async function loadOverviewAndGroups(): Promise<void> {
    if (!apiUrl) {
      setError("NEXT_PUBLIC_API_URL is not configured.");
      setLoading(false);
      return;
    }

    if (!isSignedIn) {
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
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      if (!overviewResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const overviewPayload = (await overviewResponse.json()) as FamilyOverview;
      setOverview(overviewPayload);
      if (newGroupMemberIds.length === 0) {
        setNewGroupMemberIds(
          overviewPayload.members.map((member) => member.user_id),
        );
      }

      setGroupsLoading(true);
      const groupsResponse = await fetch(
        `${apiUrl}/api/v1/families/${overviewPayload.family_id}/chat/groups`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );
      setGroupsLoading(false);

      if (!groupsResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const groupsPayload = (await groupsResponse.json()) as ChatGroupsResponse;
      setGroups(groupsPayload.groups);
      if (groupsPayload.groups.length > 0) {
        setSelectedGroupId((current) => current ?? groupsPayload.groups[0].id);
      } else {
        setSelectedGroupId(null);
      }
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    } finally {
      setLoading(false);
      setGroupsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverviewAndGroups();
  }, [apiUrl, getToken, isSignedIn, t]);

  async function loadMessages(groupId: string): Promise<void> {
    if (!overview || !apiUrl) {
      return;
    }

    setMessagesLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const messagesResponse = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${groupId}/messages?limit=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      if (!messagesResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const payload = (await messagesResponse.json()) as ChatMessagesResponse;
      setMessages(payload.messages);

      await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${groupId}/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (selectedGroupId) {
      void loadMessages(selectedGroupId);
    } else {
      setMessages([]);
    }
  }, [selectedGroupId]);

  async function onCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !apiUrl || !canManageGroups) {
      return;
    }

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
      setGroups((previous) => [...previous, created]);
      setSelectedGroupId(created.id);
      setNewGroupName("");
      setNewGroupDescription("");
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onUpdateMembers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !apiUrl || !selectedGroup || !canManageGroups) {
      return;
    }

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
      setGroups((previous) =>
        previous.map((group) => (group.id === updated.id ? updated : group)),
      );
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!overview || !apiUrl || !selectedGroup || !newMessage.trim()) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
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
          body: JSON.stringify({ content: newMessage.trim() }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        return;
      }

      const created = (await response.json()) as ChatMessage;
      setMessages((previous) => [...previous, created]);
      setNewMessage("");
      await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/chat/groups/${selectedGroup.id}/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (!overview) {
    return <p className="text-sm text-red-500">{error ?? t("errors.load")}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="portal-card">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </section>

      {canManageGroups ? (
        <section className="portal-card">
          <h2 className="text-base font-semibold">{t("groupCreateTitle")}</h2>
          <form className="mt-3 space-y-3" onSubmit={onCreateGroup}>
            <input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder={t("fields.groupName")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
            />
            <input
              value={newGroupDescription}
              onChange={(event) => setNewGroupDescription(event.target.value)}
              placeholder={t("fields.groupDescription")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            />
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {t("fields.participants")}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {overview.members.map((member) => (
                  <label
                    key={`new-group-${member.user_id}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                  >
                    <input
                      type="checkbox"
                      checked={newGroupMemberIds.includes(member.user_id)}
                      onChange={() =>
                        setNewGroupMemberIds((previous) =>
                          toggleMember(previous, member.user_id),
                        )
                      }
                    />
                    <span>{member.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("createGroup")}
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <article className="portal-card">
          <h2 className="text-base font-semibold">{t("groupsTitle")}</h2>
          {groupsLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("loading")}</p>
          ) : groups.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("emptyGroups")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-left text-sm"
                    style={{
                      borderColor: "rgb(var(--color-border))",
                      backgroundColor:
                        group.id === selectedGroupId
                          ? "rgb(var(--color-accent) / 0.12)"
                          : "transparent",
                    }}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.description ?? t("noDescription")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="portal-card">
          {!selectedGroup ? (
            <p className="text-sm text-muted-foreground">{t("selectGroup")}</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">
                  {selectedGroup.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedGroup.description ?? t("noDescription")}
                </p>
              </div>

              {canManageGroups ? (
                <form
                  className="space-y-2 rounded-md border p-3"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                  onSubmit={onUpdateMembers}
                >
                  <p className="text-sm font-medium">
                    {t("manageMembersTitle")}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {overview.members.map((member) => (
                      <label
                        key={`edit-group-${member.user_id}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={groupMemberIds.includes(member.user_id)}
                          onChange={() =>
                            setGroupMemberIds((previous) =>
                              toggleMember(previous, member.user_id),
                            )
                          }
                        />
                        <span>{member.email}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="rounded-md border px-3 py-2 text-sm font-medium"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                  >
                    {t("saveMembers")}
                  </button>
                </form>
              ) : null}

              <div
                className="max-h-[420px] space-y-2 overflow-auto rounded-md border p-3"
                style={{ borderColor: "rgb(var(--color-border))" }}
              >
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("emptyMessages")}
                  </p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-md border px-3 py-2"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">
                          {message.sender_email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(message.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {message.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <form className="flex gap-2" onSubmit={onSendMessage}>
                <input
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  placeholder={t("fields.message")}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                  maxLength={4000}
                  required
                />
                <button
                  type="submit"
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  {t("send")}
                </button>
              </form>
            </div>
          )}
        </article>
      </section>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
