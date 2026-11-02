"use client";

// In the header: "Offline" without a connection, and how many changes wait to be sent (#51).
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { onPending } from "@/lib/outbox";
import { useI18n } from "@/lib/i18n";

export default function OfflineIndicator() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const stop = onPending(setPending);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      stop();
    };
  }, []);

  if (online && pending === 0) return null;
  return (
    <span
      role="status"
      className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
      title={pending ? t("offline.waiting", { n: pending }) : t("offline.title")}
    >
      {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden /> : <CloudOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
      {online ? t("offline.syncing", { n: pending }) : pending ? t("offline.titleWaiting", { n: pending }) : t("offline.title")}
    </span>
  );
}
