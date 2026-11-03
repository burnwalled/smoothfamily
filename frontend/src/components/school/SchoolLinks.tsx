"use client";

// Family settings → a child → School from Home Assistant (3.4.0): the family admin links the child's
// school account from InfoMentor or SchoolSoft in Home Assistant. Its sensors show on the school
// card; its calendars become the child's calendar subscriptions.
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Account = { key: string; entry: string; label: string; title: string; roles: Record<string, string>; calendars: { entity: string; name: string }[]; linked_to: string | null };
type Links = { available: boolean; reachable?: boolean; accounts?: Account[]; linked?: string[]; calendars?: string[] };

const SHOWN = ["school_day", "pe", "leisure_today", "assignments", "absent_today", "weekly_letter", "news", "lunch"];

export default function SchoolLinks({ childId, name }: { childId: string; name: string }) {
  const { t } = useI18n();
  const path = `/api/school/links/${childId}`;
  const links = useApi<Links>(path).data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!links?.available) return null;
  const linked = links.linked ?? [];

  async function toggle(key: string, on: boolean) {
    const next = on ? [...linked, key] : linked.filter((k) => k !== key);
    setApiData<Links>(path, (old) => (old ? { ...old, linked: next } : old));
    setBusy(true);
    setError("");
    try {
      await api.put(path, { accounts: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5" aria-label={t("school.links.title")}>
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
        <GraduationCap className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("school.links.title")}
      </h2>
      <p className="text-xs text-muted">{t("school.links.help", { name })}</p>
      {links.reachable === false && <p className="text-sm text-red-700">{t("health.ha.unreachable")}</p>}
      {links.accounts && links.accounts.length === 0 && <p className="text-sm text-muted">{t("school.links.noneFound")}</p>}
      <ul className="space-y-2">
        {(links.accounts ?? []).map((a) => (
          <li key={a.key}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" disabled={busy} checked={linked.includes(a.key)} onChange={(e) => toggle(a.key, e.target.checked)} />
              <span>
                <span className="font-semibold">{a.label}</span> · {a.title}
                {a.linked_to && <span className="ml-1 rounded-full bg-base px-2 py-0.5 text-xs text-muted">{t("health.links.linkedTo", { name: a.linked_to })}</span>}
                <span className="block text-xs text-muted">
                  {[
                    ...SHOWN.filter((r) => a.roles[r]).map((r) => t(`school.role.${r}` as TranslationKey)),
                    ...(a.calendars.length ? [t("school.calendars", { n: a.calendars.length })] : []),
                  ].join(", ")}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {(links.calendars ?? []).length > 0 && <p className="text-xs text-muted">{t("school.links.calendarsAdded", { name })}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
