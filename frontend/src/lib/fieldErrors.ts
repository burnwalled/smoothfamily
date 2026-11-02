// Turns the server's "these fields weren't accepted" (422) into what to fix, in the reader's language.
import { ApiError } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// As the server checks them (backend/app/schemas.py).
export const USERNAME = /^[a-z0-9_.@-]{2,60}$/;
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The rule for each field that was wrong, or null when it wasn't a field problem. */
export function fieldErrors(e: unknown, t: T, minPassword = 8): string | null {
  if (!(e instanceof ApiError) || !e.fields.length) return null;
  const rules: Record<string, string> = {
    username: t("rules.username"),
    email: t("rules.email"),
    password: t("rules.password", { n: minPassword }),
  };
  return e.fields.map((f) => rules[f] ?? t("rules.field", { field: f })).join(" ");
}
