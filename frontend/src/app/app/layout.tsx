import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "../../components/theme/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();

  const navItems = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/calendar", label: t("nav.calendar") },
    { href: "/app/family", label: t("nav.family") },
    { href: "/app/settings", label: t("nav.settings") },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 flex-col border-r bg-background">
        <div className="flex h-14 items-center border-b px-6">
          <Link href="/app" className="text-lg font-semibold tracking-tight">
            {t("common.appName")}
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end gap-3 border-b px-6">
          <ThemeToggle />
          <UserButton />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
