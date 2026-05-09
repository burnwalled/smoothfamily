import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { MobileNav, SidebarNav } from "@/components/app-nav";
import { FamilyBootstrap } from "@/components/families/family-bootstrap";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  const navItems = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/calendar", label: t("nav.calendar") },
    { href: "/app/chat", label: t("nav.chat") },
    { href: "/app/lists", label: t("nav.lists") },
    { href: "/app/family", label: t("nav.family") },
    { href: "/app/settings", label: t("nav.settings") },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <FamilyBootstrap />

      {/* Desktop sidebar */}
      <aside className="hidden border-r bg-card/95 px-3 py-5 lg:flex lg:flex-col">
        <div className="mb-5 flex items-center gap-2.5 border-b px-2 pb-4">
          <div className="flex h-7 w-7 items-center justify-center bg-primary/15 text-xs font-bold text-primary"
            style={{ borderRadius: "var(--radius)" }}>
            B
          </div>
          <Link
            href="/app"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            {t("common.appName")}
          </Link>
        </div>

        <SidebarNav items={navItems} />
      </aside>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-sm">
          <div className="flex h-14 items-center justify-between gap-3 px-5 lg:justify-end lg:px-8">
            <Link
              href="/app"
              className="text-sm font-semibold tracking-tight text-foreground lg:hidden"
            >
              {t("common.appName")}
            </Link>
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <UserButton />
            </div>
          </div>

          {/* Mobile tab bar */}
          <div className="lg:hidden">
            <MobileNav items={navItems} />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
