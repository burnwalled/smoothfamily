"use client";

// The family's settings (2.8.0, tabs on top since 2.8.2): the admin's members and security, and what
// the adults the admin lets may change – everyday life, the kitchen display and sharing. Since 3.0.4
// all that is a member's own (a child's allowance, two homes, medicines, emergency card …) is on
// their page under Family members, so the children's, safety and birthday tabs are gone.
// The member's own settings live under My profile, the server's under Server settings.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Sparkles } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import TabNav from "@/components/TabNav";
import { useMe } from "@/components/Shell";
import { TranslationKey, useI18n } from "@/lib/i18n";

const SETTINGS_PAGES: { href: string; labelKey: TranslationKey; adminOnly?: boolean }[] = [
  // Adults who may manage the family open the children's pages here; accounts stay the admin's.
  { href: "/settings/members", labelKey: "settings.members" },
  { href: "/settings/everyday", labelKey: "settings.everyday" },
  { href: "/settings/kiosk", labelKey: "settings.kioskTab" },
  { href: "/settings/devices", labelKey: "settings.devicesTab", adminOnly: true },
  { href: "/settings/sharing", labelKey: "settings.sharing" },
  { href: "/settings/security-data", labelKey: "settings.securityData", adminOnly: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const me = useMe();
  const pathname = usePathname();

  const isAdmin = me.role === "admin";
  if (!isAdmin && !me.can_manage_family) {
    return (
      <>
        <PageTitle title={t("settings.familyAdminTitle")} icon={Settings} />
        <p className="mt-4 text-sm text-muted">{t("settings.adminOnly")}</p>
      </>
    );
  }

  const pages = SETTINGS_PAGES.filter((page) => isAdmin || !page.adminOnly);
  return (
    <>
      <TabNav
        label={t("settings.familyAdminTitle")}
        tabs={pages.map((page) => ({ key: page.href, href: page.href, label: t(page.labelKey), current: pathname === page.href || pathname.startsWith(`${page.href}/`) }))}
      />
      <PageTitle title={t("settings.familyAdminTitle")} icon={Settings} />
      {isAdmin && (
        <Link href="/welcome?guide=family" className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <Sparkles className="h-4 w-4" aria-hidden />
          {t("guide.open")}
        </Link>
      )}
      <div className="mt-4 min-w-0">
        {!isAdmin && SETTINGS_PAGES.some((page) => page.adminOnly && pathname === page.href) ? <p className="text-sm text-muted">{t("settings.adminOnly")}</p> : children}
      </div>
    </>
  );
}
