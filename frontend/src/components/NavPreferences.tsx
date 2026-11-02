"use client";

// Profile: the user's own menu – the order of the apps, which ones are shown, and whether the
// menu is grouped (Family, Points, Home) on phones and on computers. Only apps the family admin
// allows are listed. Grouped menus keep this order within each group. Saved right away.
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { api, Me } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { hubAllowed, MOBILE_PRIMARY, NAV, NAV_CHANGED_EVENT, NAV_GROUPS, NavPrefs, orderedNav } from "@/lib/nav";

export default function NavPreferences({ me }: { me: Me }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<NavPrefs>(() => ({
    nav_order: orderedNav(me.nav_order).map((item) => item.key),
    nav_hidden: me.nav_hidden ?? [],
    nav_group_mobile: me.nav_group_mobile === true,
    nav_group_desktop: me.nav_group_desktop !== false,
  }));
  const [error, setError] = useState("");

  async function save(patch: Partial<NavPrefs>) {
    const prev = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setError("");
    try {
      const saved = await api.patch<Me>("/api/auth/me", patch);
      const detail: NavPrefs = {
        nav_order: saved.nav_order,
        nav_hidden: saved.nav_hidden,
        nav_group_mobile: saved.nav_group_mobile,
        nav_group_desktop: saved.nav_group_desktop,
      };
      window.dispatchEvent(new CustomEvent(NAV_CHANGED_EVENT, { detail }));
    } catch (e) {
      setPrefs(prev);
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const { nav_order: order, nav_hidden: hidden } = prefs;
  const items = order.map((key) => NAV.find((item) => item.key === key)!).filter((item) => item && hubAllowed(item.key, me.apps));

  // Swap with the neighbour in the list (apps the member doesn't have keep their place).
  function move(index: number, delta: -1 | 1) {
    const next = [...order];
    const a = next.indexOf(items[index].key);
    const b = next.indexOf(items[index + delta].key);
    [next[a], next[b]] = [next[b], next[a]];
    save({ nav_order: next });
  }

  function toggle(key: string) {
    save({ nav_hidden: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] });
  }

  const groupLabel = (group?: string) => {
    const g = NAV_GROUPS.find((x) => x.key === group);
    return g ? t(g.labelKey) : "";
  };
  // Where the phone bottom bar ends when the phone menu isn't grouped.
  let visibleSeen = 0;
  const changed = hidden.length > 0 || order.some((key, i) => key !== NAV[i].key);

  return (
    <section className="card mt-4 p-5">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">{t("profile.menuTitle")}</h2>
      <div className="mb-4 mt-3 space-y-2">
        {NAV_GROUPS.length > 0 && (["nav_group_mobile", "nav_group_desktop"] as const).map((key) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary-700"
              checked={prefs[key]}
              onChange={(e) => save({ [key]: e.target.checked })}
            />
            <span>{t(key === "nav_group_mobile" ? "profile.groupMobile" : "profile.groupDesktop")}</span>
          </label>
        ))}
        <p className="text-xs text-muted">{t("profile.groupHint")}</p>
      </div>
      <p className="mb-3 text-xs text-muted">
        {prefs.nav_group_mobile ? t("profile.menuGroupsDesc") : t("profile.menuDesc", { n: MOBILE_PRIMARY })}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, index) => {
          const isHidden = item.key !== "today" && hidden.includes(item.key);
          if (!isHidden) visibleSeen += 1;
          const lastInBar = !prefs.nav_group_mobile && !isHidden && visibleSeen === MOBILE_PRIMARY;
          return (
            <li key={item.key}>
              <div className={`flex items-center gap-3 rounded-lg border border-edge px-3 py-1.5 ${isHidden ? "opacity-50" : "bg-surface"}`}>
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {t(item.labelKey)}
                  {item.group && <span className="ml-2 text-xs font-normal text-muted">{groupLabel(item.group)}</span>}
                </span>
                <button
                  className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-base disabled:opacity-30"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t("profile.menuUp", { name: t(item.labelKey) })}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-base disabled:opacity-30"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={t("profile.menuDown", { name: t(item.labelKey) })}
                >
                  <ArrowDown className="h-4 w-4" strokeWidth={2} />
                </button>
                <button
                  className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-base disabled:opacity-30"
                  onClick={() => toggle(item.key)}
                  disabled={item.key === "today"}
                  aria-pressed={!isHidden}
                  aria-label={t(isHidden ? "profile.menuShow" : "profile.menuHide", { name: t(item.labelKey) })}
                  title={item.key === "today" ? t("profile.menuTodayAlways") : undefined}
                >
                  {isHidden ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
                </button>
              </div>
              {lastInBar && index < items.length - 1 && (
                <p className="mb-1 mt-2 border-t border-dashed border-edge pt-1 text-center text-[11px] text-muted md:hidden">
                  {t("profile.menuMoreDivider")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {changed && (
        <button className="btn-ghost mt-3 text-sm" onClick={() => save({ nav_order: NAV.map((item) => item.key), nav_hidden: [] })}>
          {t("profile.menuReset")}
        </button>
      )}
    </section>
  );
}
