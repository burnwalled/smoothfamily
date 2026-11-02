"use client";

import SendToHa from "@/components/lists/SendToHa";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CloudOff, Gift, Pencil, Lock } from "lucide-react";
import { api, FamilyList, ListCategory, ListItem, Member, PantryPlace, Person } from "@/lib/api";
import { GiftPlan, WishList } from "@/components/birthdays/Gifts";
import { when } from "@/components/birthdays/People";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";
import PageTitle from "@/components/PageTitle";
import { AiTextButton } from "@/components/LocalAi";

const CATEGORIES: ListCategory[] = [
  "produce",
  "bread",
  "dairy",
  "meat_fish",
  "frozen",
  "pantry",
  "snacks",
  "beverages",
  "household",
  "other",
];

export default function ListsPage() {
  return (
    <Suspense>
      <Lists />
    </Suspense>
  );
}

function Lists() {
  const { t } = useI18n();
  const me = useMe();
  // Wish lists and the gift planning (2.8.2): a person's, opened instead of a family list. A
  // reminder opens one with ?wish=<person> or ?plan=<person>.
  const params = useSearchParams();
  const [people, setPeople] = useState<Person[]>([]);
  const [gift, setGift] = useState<{ kind: "wish" | "plan"; id: string } | null>(() => {
    const wish = params.get("wish");
    const plan = params.get("plan");
    return wish ? { kind: "wish", id: wish } : plan ? { kind: "plan", id: plan } : null;
  });
  const gifts = me.apps.includes("birthdays");
  const adult = me.role !== "child";
  useEffect(() => {
    if (gifts) api.live<Person[]>("/api/birthdays/people", setPeople).catch(() => {});
  }, [gifts]);
  const giftPerson = gift ? people.find((p) => p.id === gift.id) ?? null : null;
  const [members, setMembers] = useState<Member[]>([]);
  const [lists, setLists] = useState<FamilyList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  // Renaming the open list: the new name while typing, else null.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pantryPlace, setPantryPlace] = useState<PantryPlace>("fridge");
  const [items, setItems] = useState<ListItem[]>([]);
  const [error, setError] = useState("");

  const [newListName, setNewListName] = useState("");
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);

  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState<ListCategory>("other");

  const selectedList = lists.find((lst) => lst.id === selectedListId) || null;

  const groupedItems = useMemo(() => {
    const buckets: Record<string, ListItem[]> = {};
    for (const category of CATEGORIES) buckets[category] = [];
    for (const item of items) {
      const key = item.category ?? "other";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(item);
    }
    return buckets;
  }, [items]);

  const loadLists = useCallback(async () => {
    const pick = (rows: FamilyList[]) => {
      setLists(rows);
      if (!selectedListId && rows.length > 0) {
        setSelectedListId(rows[0].id);
      } else if (selectedListId && !rows.some((l) => l.id === selectedListId)) {
        setSelectedListId(rows[0]?.id ?? "");
      }
    };
    await Promise.all([
      api.live<Member[]>("/api/family/members", setMembers),
      api.live<FamilyList[]>("/api/lists", pick),
    ]);
  }, [selectedListId]);
  // Changes made elsewhere in the family show up at once.
  useLive(["lists"], loadLists);

  const loadItems = useCallback(async () => {
    if (!selectedListId) {
      setItems([]);
      return;
    }
    await api.live<ListItem[]>(`/api/lists/${selectedListId}/items`, setItems);
  }, [selectedListId]);
  // Changes made elsewhere in the family show up at once.
  useLive(["lists"], loadItems);

  useEffect(() => {
    loadLists().catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [loadLists, t]);

  useEffect(() => {
    loadItems().catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [loadItems, t]);

  function toggleAllowedUser(userId: string) {
    setAllowedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function createList() {
    setError("");
    try {
      const created = await api.post<FamilyList>("/api/lists", {
        name: newListName,
        allowed_user_ids: allowedUserIds,
      });
      setNewListName("");
      setAllowedUserIds([]);
      setSelectedListId(created.id);
      await loadLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function addItem() {
    if (!selectedListId || !newItemName.trim()) return;
    await api.post<ListItem>(`/api/lists/${selectedListId}/items`, {
      name: newItemName.trim(),
      category: newItemCategory,
    });
    setNewItemName("");
    await loadItems();
  }

  async function patchItem(itemId: string, patch: Partial<ListItem>) {
    if (!selectedListId) return;
    await api.patch<ListItem>(`/api/lists/${selectedListId}/items/${itemId}`, patch);
    await loadItems();
  }

  async function clearDone() {
    if (!selectedListId) return;
    await api.del(`/api/lists/${selectedListId}/done`);
    await loadItems();
  }

  // Bought (ticked) items move into the pantry.
  async function toPantry() {
    if (!selectedListId) return;
    const bought = items.filter((i) => i.done && !i.pending).map((i) => i.id);
    await api.post(`/api/pantry/from-list/${selectedListId}`, { item_ids: bought, place: pantryPlace });
    await loadItems();
  }

  async function deleteItem(itemId: string) {
    if (!selectedListId) return;
    await api.del(`/api/lists/${selectedListId}/items/${itemId}`);
    await loadItems();
  }

  async function rename() {
    if (!selectedListId || !renaming?.trim()) return;
    try {
      await api.patch(`/api/lists/${selectedListId}`, { name: renaming.trim() });
      setRenaming(null);
      await loadLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function deleteList(listId: string) {
    if (!confirm(t("common.confirmRemove", { name: lists.find((l) => l.id === listId)?.name ?? "" }))) return;
    await api.del(`/api/lists/${listId}`);
    await loadLists();
  }

  const [toHa, setToHa] = useState(false);

  async function copyAsText() {
    if (!selectedListId) return;
    const payload = await api.get<{ text: string }>(`/api/lists/${selectedListId}/export-text`);
    await navigator.clipboard.writeText(payload.text);
    alert(t("lists.copied"));
  }

  async function shareAsText() {
    if (!selectedListId || !navigator.share) return;
    const payload = await api.get<{ text: string }>(`/api/lists/${selectedListId}/export-text`);
    await navigator.share({ title: selectedList?.name ?? t("lists.title"), text: payload.text });
  }

  return (
    <>
      <PageTitle title={t("lists.title")} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-[300px_1fr]">
        <section className="card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("lists.overview")}</h2>
          <ul className="mt-3 space-y-2">
            {lists.map((lst) => (
              <li key={lst.id}>
                <button
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${!gift && selectedListId === lst.id ? "border-primary-700 bg-base" : "border-edge"}`}
                  onClick={() => { setSelectedListId(lst.id); setRenaming(null); setGift(null); }}
                >
                  <div className="font-semibold">{lst.name}</div>
                  <div className="text-xs text-muted">{/* The open list counts what is on the screen (also changes not sent yet); the others what the server says. */}
                    {selectedListId === lst.id ? items.filter((i) => i.list_id === lst.id && !i.done).length : lst.open_items ?? 0} {t("lists.items")}</div>
                </button>
              </li>
            ))}
          </ul>

          {gifts && people.length > 0 && (
            <>
              <h2 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Gift className="h-3.5 w-3.5" aria-hidden />
                {t("lists.wishLists")}
              </h2>
              <ul className="mt-2 space-y-2">
                {people.map((p) => (
                  <li key={p.id}>
                    <button
                      className={`w-full rounded border px-3 py-2 text-left text-sm ${gift?.kind === "wish" && gift.id === p.id ? "border-primary-700 bg-base" : "border-edge"}`}
                      onClick={() => setGift({ kind: "wish", id: p.id })}
                    >
                      <div className="font-semibold">{t("lists.wishListOf", { name: p.name })}</div>
                      <div className="text-xs text-muted">{t("lists.wishCount", { n: p.wish_count })} · {when(p, t)}</div>
                    </button>
                  </li>
                ))}
              </ul>
              {adult && people.some((p) => p.user_id !== me.id) && (
                <>
                  <h2 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    {t("lists.giftPlans")}
                  </h2>
                  <ul className="mt-2 space-y-2">
                    {people.filter((p) => p.user_id !== me.id).map((p) => (
                      <li key={p.id}>
                        <button
                          className={`w-full rounded border px-3 py-2 text-left text-sm ${gift?.kind === "plan" && gift.id === p.id ? "border-primary-700 bg-base" : "border-edge"}`}
                          onClick={() => setGift({ kind: "plan", id: p.id })}
                        >
                          <div className="font-semibold">{t("lists.giftPlanOf", { name: p.name })}</div>
                          <div className="text-xs text-muted">{when(p, t)}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="mt-4 space-y-2 border-t border-edge pt-3">
            <input
              className="input"
              placeholder={t("lists.newListPh")}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("lists.visibleTo")}</p>
              <div className="mt-1 space-y-1">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary-700"
                      checked={allowedUserIds.includes(m.id)}
                      onChange={() => toggleAllowedUser(m.id)}
                    />
                    {m.display_name}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full" onClick={createList} disabled={!newListName.trim()}>
              {t("common.add")}
            </button>
          </div>
        </section>

        <section className="card p-4">
          {gift && giftPerson ? (
            gift.kind === "wish" ? <WishList key={giftPerson.id} person={giftPerson} /> : <GiftPlan key={giftPerson.id} person={giftPerson} />
          ) : !selectedList ? (
            <p className="text-sm text-muted">{t("lists.empty")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renaming !== null ? (
                  <form
                    className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename();
                    }}
                  >
                    <input
                      className="input min-w-0 flex-1 py-1 text-lg font-bold"
                      value={renaming}
                      maxLength={160}
                      autoFocus
                      aria-label={t("lists.newName")}
                      onChange={(e) => setRenaming(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                    />
                    <button className="btn-primary px-3 py-1 text-xs" disabled={!renaming.trim()}>{t("lists.saveName")}</button>
                    <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setRenaming(null)}>{t("common.cancel")}</button>
                  </form>
                ) : (
                  <h2 className="flex items-center gap-1.5 text-lg font-bold">
                    {selectedList.name}
                    {me && (me.role !== "child" || me.id === selectedList.created_by) && (
                      <button className="rounded p-1 text-muted hover:bg-base hover:text-ink" onClick={() => setRenaming(selectedList.name)} aria-label={t("lists.rename", { name: selectedList.name })} title={t("lists.rename", { name: selectedList.name })}>
                        <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </h2>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={copyAsText}>{t("lists.copyText")}</button>
                  {me?.smarthome_available && (
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setToHa(!toHa)} aria-expanded={toHa}>{t("lists.toHa")}</button>
                  )}
                  {typeof navigator !== "undefined" && "share" in navigator && (
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={shareAsText}>{t("lists.share")}</button>
                  )}
                  {items.some((i) => i.done) && (
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={clearDone}>{t("lists.clearDone")}</button>
                  )}
                  {items.some((i) => i.done && !i.pending) && me?.apps?.includes("pantry") && (
                    <span className="flex items-center gap-1">
                      <select className="input w-auto py-1 text-xs" value={pantryPlace} onChange={(e) => setPantryPlace(e.target.value as PantryPlace)} aria-label={t("pantry.where")}>
                        {(["fridge", "freezer", "pantry"] as const).map((p) => <option key={p} value={p}>{t(`pantry.place.${p}`)}</option>)}
                      </select>
                      <button className="btn-ghost border border-edge px-3 py-1 text-xs" onClick={toPantry}>{t("pantry.fromList")}</button>
                    </span>
                  )}
                  {me && (me.role !== "child" || me.id === selectedList.created_by) && (
                    <button className="rounded border border-red-300 px-3 py-1 text-xs text-red-700" onClick={() => deleteList(selectedList.id)}>
                      {t("lists.deleteList")}
                    </button>
                  )}
                </div>
              </div>
              {toHa && <SendToHa listId={selectedList.id} onClose={() => setToHa(false)} onSynced={() => void loadItems()} />}
              <p className="mt-1 text-xs text-muted">{t("lists.autoSaved")}</p>

              <div className="mt-3 flex gap-2">
                <input
                  className="input"
                  placeholder={t("lists.addItemPh")}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                />
                <select className="input max-w-44" value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value as ListCategory)}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{t(`lists.category.${cat}` as Parameters<typeof t>[0])}</option>
                  ))}
                </select>
                <button className="btn-primary" onClick={addItem} disabled={!newItemName.trim()}>{t("common.add")}</button>
              </div>
              {/[,\n]| och | and | og /.test(newItemName) && (
                <div className="mt-2">
                  <AiTextButton kind="quick_add" text={newItemName} listId={selectedListId} label={t("ai.splitWithAi")} />
                </div>
              )}

              <div className="mt-4 space-y-4">
                {CATEGORIES.map((cat) => {
                  const catItems = groupedItems[cat] || [];
                  if (catItems.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t(`lists.category.${cat}` as Parameters<typeof t>[0])}</h3>
                      <ul className="mt-1 space-y-1">
                        {catItems.map((item) => (
                          <li key={item.id} className="flex items-center justify-between rounded border border-edge px-3 py-2 text-sm">
                            <label className={`flex items-center gap-2 ${item.done ? "line-through opacity-60" : ""}`}>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary-700"
                                checked={item.done}
                                onChange={(e) => patchItem(item.id, { done: e.target.checked })}
                              />
                              {item.name}
                              {item.pending && <CloudOff className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-label={t("offline.notSynced")} />}
                            </label>
                            <button className="text-xs text-red-700 hover:underline" onClick={() => deleteItem(item.id)}>
                              {t("shopping.remove")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
