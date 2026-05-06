import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FamilyBootstrap } from "../../components/families/family-bootstrap";
import { ThemeToggle } from "../../components/theme/theme-toggle";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations();

  const navItems = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/calendar", label: t("nav.calendar") },
    { href: "/app/family", label: t("nav.family") },
    { href: "/app/settings", label: t("nav.settings") },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <FamilyBootstrap />
      <aside
        className="hidden border-r px-3 py-5 lg:flex lg:flex-col"
        style={{
          borderColor: "rgb(var(--color-border))",
          backgroundColor: "rgb(var(--color-surface) / 0.86)",
        }}
      >
        <div
          className="mb-4 flex items-center gap-2 border-b px-2 pb-4"
          style={{ borderColor: "rgb(var(--color-border))" }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold"
            style={{
              backgroundColor: "rgb(var(--color-accent) / 0.2)",
              color: "rgb(var(--color-accent))",
            }}
          >
            B
          </div>
          <Link href="/app" className="text-base font-semibold tracking-tight">
            {t("common.appName")}
          </Link>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              style={{
                backgroundColor: "transparent",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-10 flex h-16 items-center justify-end gap-3 border-b px-5 backdrop-blur-sm lg:px-8"
          style={{
            borderColor: "rgb(var(--color-border))",
            backgroundColor: "rgb(var(--color-background) / 0.78)",
          }}
        >
          <ThemeToggle />
          <UserButton />
        </header>
        <main className="flex-1 overflow-auto p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
