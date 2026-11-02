"use client";

// The row of tabs at the top of a page (2.9.0: one look everywhere). An app's sibling pages
// (Shell), the family's settings, the server's settings and the profile all use it, always above
// the page's title, so the title and the content stay put when you move between tabs.
// From a tablet's width up the tabs wrap onto a second row rather than hide past the edge; on a
// phone they scroll sideways, the open one brought into view.
import { useEffect, useRef } from "react";
import Link from "next/link";

export type Tab = { key: string; label: string; current: boolean; href?: string; onClick?: () => void };

export const TAB_NAV = "-mt-1 mb-4 no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-edge sm:flex-wrap sm:overflow-visible";

export default function TabNav({ tabs, label }: { tabs: Tab[]; label: string }) {
  const cls = (current: boolean) =>
    `-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${current ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`;
  const nav = useRef<HTMLElement>(null);
  const current = tabs.find((tab) => tab.current)?.key;
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && nav.current && nav.current.scrollWidth > nav.current.clientWidth) el.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav ref={nav} className={TAB_NAV} aria-label={label}>
      {tabs.map((tab) =>
        tab.href ? (
          <Link key={tab.key} href={tab.href} aria-current={tab.current ? "page" : undefined} className={cls(tab.current)}>
            {tab.label}
          </Link>
        ) : (
          <button key={tab.key} onClick={tab.onClick} aria-current={tab.current ? "page" : undefined} className={cls(tab.current)}>
            {tab.label}
          </button>
        ),
      )}
    </nav>
  );
}
