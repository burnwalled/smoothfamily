import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["sv", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value ?? "sv";
  const locale = isSupportedLocale(raw) ? raw : "sv";

  return {
    locale,
    messages: (await import(`../locales/${locale}/common.json`)).default,
  };
});
