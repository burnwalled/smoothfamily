// Offline writes (#51): ticking, adding and removing list items and completing a task work without
// a connection. The change is shown at once (in the read cache, marked `pending`) and kept in an
// outbox in IndexedDB; it is sent in order when the app is back online.
//
// Conflicts: the last write wins for list items; completing a task is once a day, so a completion
// the server already has (409) is simply dropped. An item added offline and then ticked or removed
// before it was sent only changes the queued add.
import { del, get, set } from "idb-keyval";
import { apiKey, queryClient } from "@/lib/queryClient";

type Op = { id: string; method: string; path: string; body?: unknown; at: number };

const KEY = "sf:outbox";
const ITEM = /^\/api\/lists\/([^/]+)\/items(?:\/([^/]+))?$/;
const COMPLETE = /^\/api\/tasks\/([^/]+)\/complete$/;
const TEMP = "tmp-";

let queue: Op[] = [];
let loaded: Promise<void> | null = null;
let flushing = false;
const listeners = new Set<(pending: number) => void>();

function load(): Promise<void> {
  loaded ??= (typeof window === "undefined" ? Promise.resolve() : get<Op[]>(KEY).then((q) => void (queue = q ?? [])).catch(() => {}));
  return loaded;
}

async function save() {
  await (queue.length ? set(KEY, queue) : del(KEY)).catch(() => {});
  for (const listener of listeners) listener(queue.length);
}

/** Whether this write may wait for the network. */
export function canQueue(method: string, path: string): boolean {
  return (ITEM.test(path) && ["POST", "PATCH", "DELETE"].includes(method)) || (COMPLETE.test(path) && method === "POST");
}

export function pendingCount(): number {
  return queue.length;
}

export function hasPending(): boolean {
  return queue.length > 0;
}

export function onPending(listener: (pending: number) => void): () => void {
  listeners.add(listener);
  void load().then(() => listener(queue.length));
  return () => listeners.delete(listener);
}

type Item = { id: string; name: string; done: boolean; pending?: boolean; [k: string]: unknown };

/** Shows the change in the read cache right away; returns what the server would have answered. */
function applyLocally(op: Op): unknown {
  const item = op.path.match(ITEM);
  if (item) {
    const [, listId, itemId] = item;
    const key = apiKey(`/api/lists/${listId}/items`);
    const rows = queryClient.getQueryData<Item[]>(key) ?? [];
    if (op.method === "POST") {
      const created = { id: op.id, list_id: listId, name: "", done: false, position: rows.length, category: null, ...(op.body as object), pending: true } as Item;
      queryClient.setQueryData(key, [...rows, created]);
      return created;
    }
    if (op.method === "PATCH") {
      const next = rows.map((r) => (r.id === itemId ? { ...r, ...(op.body as object), pending: true } : r));
      queryClient.setQueryData(key, next);
      return next.find((r) => r.id === itemId);
    }
    queryClient.setQueryData(key, rows.filter((r) => r.id !== itemId));
    return undefined;
  }
  const done = op.path.match(COMPLETE);
  if (done) {
    const key = apiKey("/api/tasks/today");
    type Today = { task: { id: string; requires_approval?: boolean }; done: boolean; completion_status: string | null; pending?: boolean };
    const rows = queryClient.getQueryData<Today[]>(key) ?? [];
    const next = rows.map((r) => (r.task.id === done[1] ? { ...r, done: true, pending: true } : r));
    queryClient.setQueryData(key, next);
    return { ...(next.find((r) => r.task.id === done[1]) ?? {}), unlocked: [] };
  }
  return undefined;
}

/** Queues a write and shows it at once. */
export async function enqueue(method: string, path: string, body?: unknown): Promise<unknown> {
  await load();
  const item = path.match(ITEM);
  // Changing an item that was itself added offline: change the queued add instead.
  if (item?.[2]?.startsWith(TEMP)) {
    const add = queue.find((op) => op.id === item[2]);
    if (add) {
      if (method === "DELETE") queue = queue.filter((op) => op !== add);
      else add.body = { ...(add.body as object), ...(body as object) };
    }
    const result = applyLocally({ id: item[2], method, path, body, at: Date.now() });
    await save();
    return result;
  }
  const op: Op = { id: `${TEMP}${crypto.randomUUID()}`, method, path, body, at: Date.now() };
  queue.push(op);
  const result = applyLocally(op);
  await save();
  return result;
}

/** Sends what is waiting, in order; stops at the first network error. */
export async function flush(): Promise<void> {
  await load();
  if (flushing || !queue.length || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  flushing = true;
  const touched = new Set<string>();
  try {
    while (queue.length) {
      const op = queue[0];
      let status: number;
      try {
        const resp = await fetch(op.path, {
          method: op.method,
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: op.body === undefined ? undefined : JSON.stringify(op.body),
        });
        status = resp.status;
      } catch {
        break; // still offline
      }
      if (status >= 500) break; // try again later
      // Done – or not possible any more (removed meanwhile, already completed today …): drop it.
      queue.shift();
      touched.add(apiKey(op.path)[1]);
      await save();
    }
  } finally {
    flushing = false;
  }
  for (const resource of touched) {
    for (const r of resource === "lists" ? ["lists", "tasks"] : ["tasks", "achievements", "allowance", "rewards", "dashboard"]) {
      void queryClient.invalidateQueries({ queryKey: ["api", r] }, { cancelRefetch: false });
    }
  }
}

/** Sends the outbox when the connection comes back, and every half minute while something waits. */
export function startOutbox(): () => void {
  if (typeof window === "undefined") return () => {};
  const tick = () => void flush();
  window.addEventListener("online", tick);
  const timer = window.setInterval(() => queue.length && tick(), 30_000);
  void load().then(tick);
  return () => {
    window.removeEventListener("online", tick);
    window.clearInterval(timer);
  };
}
