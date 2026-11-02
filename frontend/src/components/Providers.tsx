"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { startOutbox } from "@/lib/outbox";
import { ThemeProvider } from "@/lib/theme";
import { useRouter } from "next/navigation";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Changes made offline are sent when the connection is back (lib/outbox.ts).
  useEffect(() => startOutbox(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; route?: string };
      if (data?.type === "navigate" && typeof data.route === "string") {
        router.push(data.route);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>{children}</I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
