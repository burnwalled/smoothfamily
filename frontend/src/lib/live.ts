"use client";

// Live updates: one Server-Sent Events stream (/api/events) per open app. Each event names the
// resources that changed ("tasks"); their cached queries are refreshed and pages listening with
// `useLive` reload. Polling stays as a slow fallback, faster while the stream is down.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { relatedResources } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const LIVE_EVENT = "sf:live";
const MAX_RETRY_MS = 60_000;

let connected = false;
const listeners = new Set<() => void>();

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  listeners.forEach((l) => l());
}

/** Opens the stream; returns a function that closes it. Called once by the Shell. */
export function startLiveUpdates(): () => void {
  let source: EventSource | null = null;
  let retryMs = 5_000;
  let retryTimer: number | undefined;
  let stopped = false;

  const open = () => {
    source = new EventSource("/api/events");
    source.onopen = () => {
      retryMs = 5_000;
      setConnected(true);
    };
    source.onmessage = (e) => {
      let resources: string[] = [];
      try {
        resources = (JSON.parse(e.data) as { resources?: string[] }).resources ?? [];
      } catch {
        return;
      }
      const all = [...new Set(resources.flatMap((r) => [r, ...relatedResources(r)]))];
      for (const r of all) void queryClient.invalidateQueries({ queryKey: ["api", r] }, { cancelRefetch: false });
      window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: all }));
    };
    source.onerror = () => {
      setConnected(false);
      // The browser retries by itself while the connection is merely interrupted; when it has
      // given up (signed out, live updates off) try again later, a little slower each time.
      if (source?.readyState === EventSource.CLOSED && !stopped) {
        source = null;
        retryTimer = window.setTimeout(open, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      }
    };
  };

  open();
  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    source?.close();
    setConnected(false);
  };
}

/** Whether the live stream is up (pages poll less often while it is). */
export function useLiveConnected(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => connected,
    () => false
  );
}

/** Calls `onChange` when one of `resources` changes anywhere in the family. */
export function useLive(resources: string[], onChange: () => unknown) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const key = resources.join(",");
  useEffect(() => {
    const wanted = key.split(",");
    const handler = (e: Event) => {
      if (!(e as CustomEvent<string[]>).detail.some((r) => wanted.includes(r))) return;
      // A failed refresh is retried by the next event or poll.
      Promise.resolve(callback.current()).catch(() => {});
    };
    window.addEventListener(LIVE_EVENT, handler);
    return () => window.removeEventListener(LIVE_EVENT, handler);
  }, [key]);
}
