// One TanStack Query client for the whole app. Every read is cached under its API path, kept in
// IndexedDB so a reopened app starts with what it showed last, and refreshed in the background.
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { LATEST_VERSION } from "@/lib/releaseNotes";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// API resources that are never saved to the device (see restored below).
// The vault too: its documents and the password manager's accounts (2.8.1).
const NOT_SAVED = new Set(["documents", "vault"]);

// Network errors and 5xx are retried with backoff; 4xx (signed out, forbidden, not found) are not.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: WEEK_MS,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
  },
});

// Query key for an API path: ["api", "<resource>", "<path>"], so a write can invalidate one
// resource ("tasks") at a time.
export function apiKey(path: string): readonly [string, string, string] {
  const resource = path.replace(/^\/api\//, "").split(/[/?]/)[0];
  return ["api", resource, path] as const;
}

function goneForGood(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

const persister =
  typeof window === "undefined"
    ? null
    : createAsyncStoragePersister({
        storage: { getItem: get, setItem: set, removeItem: del },
        key: "sf:query-cache",
      });

// The localStorage cache used before 1.7 is no longer read…
if (typeof window !== "undefined") {
  try {
    for (const key of Object.keys(localStorage)) {
      // …nor the kitchen display's own copy before 3.1.1.
      if (key.startsWith("sf:cache:") || key.startsWith("sf.kiosk:")) localStorage.removeItem(key);
    }
  } catch {}
}

// Resolves once the saved cache is back in memory (immediately on the server).
export const restored: Promise<void> = persister
  ? Promise.resolve(
      persistQueryClient({
        queryClient,
        persister,
        maxAge: WEEK_MS,
        buster: LATEST_VERSION,
        // Documents and the vault are only kept in memory, never written to the device. What a refresh
        // failed for is kept (a kitchen display without a connection shows what it had) – but not an
        // answer that is gone for good (a removed screen's link, 404).
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.data !== undefined && !goneForGood(query.state.error) && !NOT_SAVED.has(String(query.queryKey[1])),
        },
      })[1]
    ).catch(() => {})
  : Promise.resolve();

export function clearQueryCache() {
  queryClient.clear();
  if (persister) Promise.resolve(persister.removeClient()).catch(() => {});
}
