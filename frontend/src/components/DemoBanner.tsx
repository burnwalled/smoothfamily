"use client";

// The demo banner: whose eyes you see the demo through (one tap to switch member), start over
// with fresh sample data, or leave the demo to create your own family.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Sparkles } from "lucide-react";
import { api, Me } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { clearApiCache } from "@/lib/api";

// The invitation the demo came from, so "Create my own family" can lead back to it.
export const DEMO_INVITE_KEY = "sf.demo-invite";

type DemoInfo = { members: { id: string; name: string; role: string; color: string }[]; invitation: boolean };

export default function DemoBanner({ me }: { me: Me }) {
  const { t } = useI18n();
  const router = useRouter();
  const info = useApi<DemoInfo>("/api/demo").data ?? null;
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<unknown>, to = "/") {
    setBusy(true);
    try {
      await action();
      clearApiCache();
      // A full reload: every page and the cache start over as the new member.
      window.location.assign(to);
    } finally {
      setBusy(false);
    }
  }

  function createOwn() {
    let token: string | null = null;
    try {
      token = localStorage.getItem(DEMO_INVITE_KEY);
    } catch {}
    if (info?.invitation && token) {
      router.push(`/invite/${token}`);
      return;
    }
    act(() => api.post("/api/demo/leave"), "/login");
  }

  return (
    <div data-demo-banner className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("demo.banner")}
        </span>
        <span className="flex flex-wrap items-center gap-1" role="group" aria-label={t("demo.viewAs")}>
          <span className="text-xs">{t("demo.viewAs")}</span>
          {info?.members.map((m) => (
            <button
              key={m.id}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${m.id === me.id ? "border-amber-900 bg-amber-900 font-semibold text-white" : "border-amber-400 bg-white hover:bg-amber-100"}`}
              onClick={() => m.id !== me.id && act(() => api.post("/api/demo/switch", { user_id: m.id }))}
              aria-pressed={m.id === me.id}
              disabled={busy}
            >
              {m.name}
            </button>
          ))}
        </span>
        <span className="ml-auto flex gap-2">
          <button className="inline-flex items-center gap-1 rounded border border-amber-400 bg-white px-2.5 py-1 text-xs hover:bg-amber-100" onClick={() => act(() => api.post("/api/demo/reset"))} disabled={busy}>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("demo.reset")}
          </button>
          <button className="rounded bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800" onClick={createOwn} disabled={busy}>
            {t("demo.createOwn")}
          </button>
        </span>
      </div>
    </div>
  );
}
