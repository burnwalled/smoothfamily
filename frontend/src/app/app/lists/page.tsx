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
  name: string;
};

type ChatGroupsResponse = {
  groups: ChatGroup[];
};

type SharedList = {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  visible_member_user_ids: string[];
  visible_chat_group_ids: string[];
  total_items_count: number;
  open_items_count: number;
};

type SharedListsResponse = {
  lists: SharedList[];
};

type SharedListItem = {
  id: string;
  list_id: string;
  family_id: string;
  title: string;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type SharedListItemsResponse = {
  items: SharedListItem[];
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

export default function ListsPage() {
  const t = useTranslations("lists");
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = useMemo(() => resolveApiUrl(API_URL), []);

  const [overview, setOverview] = useState<FamilyOverview | null>(null);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [lists, setLists] = useState<SharedList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [items, setItems] = useState<SharedListItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newListTitle, setNewListTitle] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListVisibleMembers, setNewListVisibleMembers] = useState<string[]>(
    [],
  );
  const [newListVisibleGroups, setNewListVisibleGroups] = useState<string[]>(
    [],
  );
  const [newItemTitle, setNewItemTitle] = useState("");

  const selectedList = useMemo(
    () => lists.find((candidate) => candidate.id === selectedListId) ?? null,
    [lists, selectedListId],
  );

  const canManageLists = useMemo(() => {
    const role = overview?.current_user_role;
    return role === "owner" || role === "parent";
  }, [overview?.current_user_role]);

  function toggleInArray(values: string[], value: string): string[] {
    return values.includes(value)
      ? values.filter((current) => current !== value)
      : [...values, value];
  }

  async function loadInitialData(): Promise<void> {
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

      if (newListVisibleMembers.length === 0) {
        setNewListVisibleMembers(
          overviewPayload.members.map((member) => member.user_id),
        );
      }

      const listsResponse = await fetch(
        `${apiUrl}/api/v1/families/${overviewPayload.family_id}/lists`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      if (!listsResponse.ok) {
        setError(t("errors.load"));
        return;
      }

      const listsPayload = (await listsResponse.json()) as SharedListsResponse;
      setLists(listsPayload.lists);
      setSelectedListId(
        (current) => current ?? listsPayload.lists[0]?.id ?? null,
      );

      try {
        const groupsResponse = await fetch(
          `${apiUrl}/api/v1/families/${overviewPayload.family_id}/chat/groups`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );

        if (groupsResponse.ok) {
          const groupsPayload =
            (await groupsResponse.json()) as ChatGroupsResponse;
          setChatGroups(groupsPayload.groups);
        } else {
          setChatGroups([]);
        }
      } catch {
        setChatGroups([]);
      }
    } catch (loadError) {
      const detail =
        loadError instanceof Error ? ` (${loadError.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitialData();
  }, [apiUrl, getToken, isSignedIn, t]);

  async function loadItemsForList(listId: string): Promise<void> {
    if (!overview || !apiUrl) {
      return;
    }

    setItemsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/lists/${listId}/items`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        setError(t("errors.load"));
        return;
      }

      const payload = (await response.json()) as SharedListItemsResponse;
      setItems(payload.items);
    } catch (loadError) {
      const detail =
        loadError instanceof Error ? ` (${loadError.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedListId) {
      void loadItemsForList(selectedListId);
    } else {
      setItems([]);
    }
  }, [selectedListId]);

  async function onCreateList(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!overview || !apiUrl || !canManageLists || !newListTitle.trim()) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/lists`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: newListTitle.trim(),
            description: newListDescription.trim() || null,
            visible_member_user_ids: newListVisibleMembers,
            visible_chat_group_ids: newListVisibleGroups,
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

      const created = (await response.json()) as SharedList;
      setLists((previous) => [created, ...previous]);
      setSelectedListId(created.id);
      setNewListTitle("");
      setNewListDescription("");
      setNewListVisibleGroups([]);
    } catch (saveError) {
      const detail =
        saveError instanceof Error ? ` (${saveError.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onDeleteList(): Promise<void> {
    if (!overview || !apiUrl || !selectedList || !canManageLists) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/lists/${selectedList.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        return;
      }

      setLists((previous) =>
        previous.filter((entry) => entry.id !== selectedList.id),
      );
      setSelectedListId((current) => {
        if (current !== selectedList.id) {
          return current;
        }
        const next = lists.find((entry) => entry.id !== selectedList.id);
        return next?.id ?? null;
      });
    } catch (saveError) {
      const detail =
        saveError instanceof Error ? ` (${saveError.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onCreateItem(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!overview || !apiUrl || !selectedList || !newItemTitle.trim()) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/lists/${selectedList.id}/items`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: newItemTitle.trim() }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        setError(payload.detail ?? t("errors.save"));
        return;
      }

      const created = (await response.json()) as SharedListItem;
      setItems((previous) => [...previous, created]);
      setLists((previous) =>
        previous.map((entry) =>
          entry.id === selectedList.id
            ? {
                ...entry,
                total_items_count: entry.total_items_count + 1,
                open_items_count: entry.open_items_count + 1,
              }
            : entry,
        ),
      );
      setNewItemTitle("");
    } catch (saveError) {
      const detail =
        saveError instanceof Error ? ` (${saveError.message})` : "";
      setError(`${t("errors.network")}${detail}`);
    }
  }

  async function onToggleItem(item: SharedListItem): Promise<void> {
    if (!overview || !apiUrl || !selectedList) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setError(t("errors.auth"));
        return;
      }

      const response = await fetch(
        `${apiUrl}/api/v1/families/${overview.family_id}/lists/${selectedList.id}/items/${item.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: item.title,
            is_completed: !item.is_completed,
            sort_order: item.sort_order,
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

      const updated = (await response.json()) as SharedListItem;
      setItems((previous) =>
        previous.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setLists((previous) =>
        previous.map((entry) => {
          if (entry.id !== selectedList.id) {
            return entry;
          }

          const wasCompleted = item.is_completed;
          const nowCompleted = updated.is_completed;
          const openDelta =
            wasCompleted === nowCompleted ? 0 : wasCompleted ? 1 : -1;

          return {
            ...entry,
            open_items_count: Math.max(0, entry.open_items_count + openDelta),
          };
        }),
      );
    } catch (saveError) {
      const detail =
        saveError instanceof Error ? ` (${saveError.message})` : "";
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

      {canManageLists ? (
        <section className="portal-card space-y-3">
          <h2 className="text-base font-semibold">{t("createTitle")}</h2>
          <form className="space-y-3" onSubmit={onCreateList}>
            <input
              value={newListTitle}
              onChange={(event) => setNewListTitle(event.target.value)}
              placeholder={t("fields.listTitle")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
              required
            />
            <input
              value={newListDescription}
              onChange={(event) => setNewListDescription(event.target.value)}
              placeholder={t("fields.listDescription")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              style={{ borderColor: "rgb(var(--color-border))" }}
            />

            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                {t("fields.visibleMembers")}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {overview.members.map((member) => (
                  <label
                    key={`visible-member-${member.user_id}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                  >
                    <input
                      type="checkbox"
                      checked={newListVisibleMembers.includes(member.user_id)}
                      onChange={() =>
                        setNewListVisibleMembers((previous) =>
                          toggleInArray(previous, member.user_id),
                        )
                      }
                    />
                    <span>{member.email}</span>
                  </label>
                ))}
              </div>
            </div>

            {chatGroups.length > 0 ? (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  {t("fields.visibleGroups")}
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {chatGroups.map((group) => (
                    <label
                      key={`visible-group-${group.id}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      <input
                        type="checkbox"
                        checked={newListVisibleGroups.includes(group.id)}
                        onChange={() =>
                          setNewListVisibleGroups((previous) =>
                            toggleInArray(previous, group.id),
                          )
                        }
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm font-medium"
              style={{ borderColor: "rgb(var(--color-border))" }}
            >
              {t("create")}
            </button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <article className="portal-card">
          <h2 className="text-base font-semibold">{t("listsTitle")}</h2>
          {lists.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("emptyLists")}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {lists.map((sharedList) => (
                <li key={sharedList.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-3 py-2 text-left"
                    style={{
                      borderColor: "rgb(var(--color-border))",
                      backgroundColor:
                        sharedList.id === selectedListId
                          ? "rgb(var(--color-accent) / 0.12)"
                          : "transparent",
                    }}
                    onClick={() => setSelectedListId(sharedList.id)}
                  >
                    <p className="text-sm font-medium">{sharedList.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("remainingCount", {
                        open: sharedList.open_items_count,
                        total: sharedList.total_items_count,
                      })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="portal-card">
          {!selectedList ? (
            <p className="text-sm text-muted-foreground">{t("selectList")}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">
                    {selectedList.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedList.description || t("noDescription")}
                  </p>
                </div>
                {canManageLists ? (
                  <button
                    type="button"
                    className="rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "rgb(var(--color-border))" }}
                    onClick={() => {
                      void onDeleteList();
                    }}
                  >
                    {t("deleteList")}
                  </button>
                ) : null}
              </div>

              <form className="flex gap-2" onSubmit={onCreateItem}>
                <input
                  value={newItemTitle}
                  onChange={(event) => setNewItemTitle(event.target.value)}
                  placeholder={t("fields.itemTitle")}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                  required
                />
                <button
                  type="submit"
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  style={{ borderColor: "rgb(var(--color-border))" }}
                >
                  {t("addItem")}
                </button>
              </form>

              <div
                className="max-h-[460px] space-y-2 overflow-auto rounded-md border p-3"
                style={{ borderColor: "rgb(var(--color-border))" }}
              >
                {itemsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    {t("loading")}
                  </p>
                ) : items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("emptyItems")}
                  </p>
                ) : (
                  items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: "rgb(var(--color-border))" }}
                    >
                      <input
                        type="checkbox"
                        checked={item.is_completed}
                        onChange={() => {
                          void onToggleItem(item);
                        }}
                      />
                      <span
                        className={
                          item.is_completed
                            ? "line-through text-muted-foreground"
                            : ""
                        }
                      >
                        {item.title}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </article>
      </section>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
