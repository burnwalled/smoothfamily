"use client";

// Hook form of the API cache: `useApi("/api/tasks/today")` returns the cached answer at once and
// refreshes it in the background, on window focus and after writes that touch the resource.
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api";
import { apiKey } from "@/lib/queryClient";

type Options<T> = Omit<UseQueryOptions<T, Error, T, readonly string[]>, "queryKey" | "queryFn">;

export function useApi<T>(path: string | null, options?: Options<T>) {
  return useQuery<T, Error, T, readonly string[]>({
    queryKey: path ? apiKey(path) : ["api", "none"],
    queryFn: () => request<T>(path!),
    enabled: path !== null && (options?.enabled ?? true),
    ...options,
  });
}
