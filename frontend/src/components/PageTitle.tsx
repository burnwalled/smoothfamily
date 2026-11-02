"use client";

// The page heading every app uses (#48): the app's menu icon and its name, in one style. The icon
// comes from the menu (lib/nav.ts) for the current address, so it always matches the menu.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, LucideIcon, MessageSquareHeart, Newspaper, UserRound } from "lucide-react";
import { APP_PAGES } from "@/lib/nav";
import { useI18n } from "@/lib/i18n";
import { topicForPath } from "@/help/topics";

// Pages that aren't in the menu.
const EXTRA: Record<string, LucideIcon> = { "/profile": UserRound, "/feedback": MessageSquareHeart, "/help": CircleHelp, "/news": Newspaper };

export function pageIcon(pathname: string): LucideIcon | undefined {
  if (EXTRA[pathname]) return EXTRA[pathname];
  const item = APP_PAGES.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.icon;
}

export default function PageTitle({ title, icon, className = "" }: { title: React.ReactNode; icon?: LucideIcon; className?: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const Icon = icon ?? pageIcon(pathname);
  // The ? next to the title: the help for this page (3.0.2).
  const help = pathname.startsWith("/help") ? undefined : topicForPath(pathname);
  const heading = (
    <h1 className={`flex min-h-10 items-center gap-2 text-2xl font-extrabold tracking-tight ${help ? "" : className}`}>
      {Icon && <Icon className="h-6 w-6 shrink-0 text-accent" strokeWidth={2} aria-hidden />}
      {title}
    </h1>
  );
  if (!help) return heading;
  // Beside the heading, not in it – the heading's name stays the page's name.
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      {heading}
      <Link
        href={`/help/${help.id}`}
        className="text-muted hover:text-accent"
        aria-label={typeof title === "string" ? t("help.helpFor", { title }) : t("help.title")}
        title={t("help.title")}
      >
        <CircleHelp className="h-5 w-5" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}

/** "Nothing here yet" – the same everywhere: a dashed box with a short text and maybe an action. */
export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-edge p-4 text-sm text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
