"use client";

// The little ones' mode per child, as switches (3.0.1) – for the family's setup guide. A child of 6
// or younger whose birthday was given starts with it on; the routines are made under Tasks.
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";

type Child = { id: string; display_name: string; color: string; easy_mode: boolean };

export default function EasyModeSwitches() {
  const { t } = useI18n();
  const childrenQuery = useApi<Child[]>("/api/easy/children");
  const children = childrenQuery.data ?? (childrenQuery.isError ? NONE : null);
  const setChildren = (update: (all: Child[] | undefined) => Child[] | undefined) => setApiData<Child[]>("/api/easy/children", update);
  const [error, setError] = useState("");

  if (!children) return null;
  if (children.length === 0) return <p className="text-sm text-muted">{t("easy.noChildrenYet")}</p>;

  async function toggle(child: Child, on: boolean) {
    setError("");
    setChildren((all) => all?.map((c) => (c.id === child.id ? { ...c, easy_mode: on } : c)));
    try {
      await api.put(`/api/easy/children/${child.id}`, { easy_mode: on });
    } catch (e) {
      setChildren((all) => all?.map((c) => (c.id === child.id ? { ...c, easy_mode: !on } : c)));
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="card p-5" aria-label={t("easy.title")}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("easy.title")}</h2>
      <ul className="space-y-2">
        {children.map((child) => (
          <li key={child.id}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={child.easy_mode} onChange={(e) => toggle(child, e.target.checked)} />
              <span className="h-3 w-3 rounded-full" style={{ background: child.color }} aria-hidden />
              {child.display_name}
              {child.easy_mode && <span aria-hidden>🧸</span>}
            </label>
          </li>
        ))}
      </ul>
      <Link href="/tasks/little" className="mt-3 inline-block text-xs text-accent hover:underline">{t("easy.makeRoutines")}</Link>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
