"use client";

// Smart home: every device the user may control (with a star to pick the ones on their Today
// card), and their own flows. The family admin decides which devices exist and who may use them.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, Settings } from "lucide-react";
import SmartHomeWidget from "@/components/widgets/SmartHomeWidget";
import Flows from "@/components/Flows";
import HaSimulator from "@/components/HaSimulator";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";

type Tab = "devices" | "flows";

export default function SmartHomePage() {
  const { t } = useI18n();
  const me = useMe();
  const [tab, setTab] = useState<Tab>("devices");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "flows") setTab("flows");
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Lightbulb className="h-6 w-6 text-accent" strokeWidth={2} aria-hidden />
          {t("nav.smarthome")}
        </h1>
        {(me?.role === "admin" || me?.can_manage_family) && me.smarthome_available && (
          <Link href="/settings/smarthome" className="btn-ghost text-sm">
            <Settings className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("smarthome.manage")}
          </Link>
        )}
      </div>
      {me.smarthome_available && !me.smarthome_gateway_only && (
        <div className="mt-4 inline-flex rounded-lg border border-edge bg-surface p-1" role="tablist">
          {(["devices", "flows"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`rounded px-3 py-1 text-sm ${tab === key ? "bg-base font-semibold" : "text-muted"}`}
              onClick={() => setTab(key)}
            >
              {key === "devices" ? t("smarthome.devicesHeading") : t("flows.title")}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6">
        {me.smarthome_available && !me.smarthome_gateway_only && <HaSimulator />}
        {tab === "flows" && me.smarthome_available && !me.smarthome_gateway_only ? <Flows /> : <SmartHomeWidget app />}
      </div>
    </>
  );
}
