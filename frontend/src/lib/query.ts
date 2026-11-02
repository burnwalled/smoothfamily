"use client";

// Hook form of the API cache: `useApi("/api/tasks/today")` returns the cached answer at once and
// refreshes it in the background, on window focus, after writes that touch the resource and when a
// live event names it (lib/live.ts). Pages read through these hooks; writes go through `api.post`,
// `api.put`, `api.patch` and `api.del`, which invalidate what they changed – no reloading by hand.
import { useQueries, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api";
import { apiKey, queryClient, shouldRetry } from "@/lib/queryClient";

type Options<T> = Omit<UseQueryOptions<T, Error, T, readonly string[]>, "queryKey" | "queryFn">;

// One empty list for "nothing yet", so `data ?? NONE` keeps the same reference between renders.
export const NONE: never[] = [];

export function useApi<T>(path: string | null, options?: Options<T>) {
  return useQuery<T, Error, T, readonly string[]>({
    queryKey: path ? apiKey(path) : ["api", "none"],
    queryFn: () => request<T>(path!),
    enabled: path !== null && (options?.enabled ?? true),
    retry: shouldRetry,
    ...options,
  });
}

/** Several reads whose number changes (each list's items): the answers in the paths' order. */
export function useApis<T>(paths: string[]): (T | undefined)[] {
  return useQueries({
    queries: paths.map((path) => ({ queryKey: apiKey(path), queryFn: () => request<T>(path), retry: shouldRetry })),
  }).map((q) => q.data as T | undefined);
}

/** Change a cached answer at once – a tap shows before the server has answered. The write that
 *  follows invalidates it, so the server's own answer replaces it. */
export function setApiData<T>(path: string, update: (old: T | undefined) => T | undefined) {
  queryClient.setQueryData<T>(apiKey(path), update);
}

/** Read an answer again now (after something the API doesn't know changed it). */
export function refreshApi(path: string) {
  return queryClient.invalidateQueries({ queryKey: apiKey(path) });
}

/** Read everything of a resource again ("vault") – after an upload that went past api.post. */
export function refreshResource(resource: string) {
  return queryClient.invalidateQueries({ queryKey: ["api", resource] });
}
