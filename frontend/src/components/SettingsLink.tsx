"use client";

// For those who may change the family's settings: where this app's settings are now (2.8.2).
import Link from "next/link";
import { Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function SettingsLink({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
      <Settings className="h-4 w-4" aria-hidden />
      {t("settings.changeThere")}
    </Link>
  );
}
