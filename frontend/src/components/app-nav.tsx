"use client";

import {
  Calendar,
  LayoutDashboard,
  List,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/app": LayoutDashboard,
  "/app/calendar": Calendar,
  "/app/chat": MessageSquare,
  "/app/lists": List,
  "/app/family": Users,
  "/app/settings": Settings,
};

type NavItem = { href: string; label: string };

function isActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            style={{ borderRadius: "var(--radius)" }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1.5 overflow-x-auto border-t px-4 py-2">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
            style={{ borderRadius: "var(--radius)" }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xs:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
