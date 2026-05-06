import { cookies } from "next/headers";
import svMessages from "../locales/sv/common.json";
import enMessages from "../locales/en/common.json";

const messages = { sv: svMessages, en: enMessages } as const;
export type Locale = keyof typeof messages;
export type Messages = (typeof messages)[Locale];

const SUPPORTED: Locale[] = ["sv", "en"];

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get("locale")?.value ?? "sv";
  return SUPPORTED.includes(raw as Locale) ? (raw as Locale) : "sv";
}

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
