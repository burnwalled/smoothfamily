"use client";

// An invitation from the server's admin: try the demo first, or create your own family. The
// link is the only way to get a family on a hosted server; an invalid or expired link only says so.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { EMAIL, USERNAME, fieldErrors } from "@/lib/fieldErrors";
import { DEMO_INVITE_KEY } from "@/components/DemoBanner";

type InviteInfo = { label: string; expires_at: string; demo_active: boolean; password_min: number };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { t, locale, dateLocale } = useI18n();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [form, setForm] = useState({ family_name: "", display_name: "", email: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InviteInfo>(`/api/invite/${token}`).then(setInfo).catch(() => setInvalid(true));
  }, [token]);

  function explain(e: unknown): string {
    if (e instanceof ApiError && e.status === 409) return t("invite.usernameTaken");
    return fieldErrors(e, t) ?? (e instanceof Error ? e.message : t("common.error"));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const tryDemo = () =>
    run(async () => {
      await api.post(`/api/invite/${token}/demo`, { language: locale });
      try {
        localStorage.setItem(DEMO_INVITE_KEY, token);
      } catch {}
      router.replace("/");
    });

  const create = () =>
    run(async () => {
      await api.post(`/api/invite/${token}/family`, { ...form, username, email: form.email.trim(), language: locale });
      try {
        localStorage.removeItem(DEMO_INVITE_KEY);
      } catch {}
      router.replace("/");
    });

  // The same rules as the server, shown as you type (only once something is typed).
  const least = info?.password_min ?? 12;
  const username = form.username.trim();
  const problem: Partial<Record<keyof typeof form, string>> = {
    username: username && !USERNAME.test(username) ? t("rules.username") : undefined,
    email: form.email.trim() && !EMAIL.test(form.email.trim()) ? t("rules.email") : undefined,
    password: form.password && form.password.length < least ? t("rules.password", { n: least }) : undefined,
  };
  const ready = form.family_name.trim() && form.display_name.trim() && USERNAME.test(username) && EMAIL.test(form.email.trim()) && form.password.length >= least;

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`invite-${key}`}>{label}</label>
      <input
        id={`invite-${key}`}
        className="input"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: key === "username" ? e.target.value.toLowerCase() : e.target.value })}
        aria-invalid={!!problem[key]}
        aria-describedby={problem[key] ? `invite-${key}-rule` : undefined}
        {...props}
      />
      {problem[key] && (
        <p id={`invite-${key}-rule`} className="mt-1 text-xs text-red-700">
          {problem[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="grid min-h-screen place-items-center bg-primary-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-primary-100">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Smooth Family</h1>
          <p className="mt-1 text-sm opacity-80">{t("login.tagline")}</p>
        </div>
        {invalid ? (
          <div className="card p-6 text-center">
            <h2 className="text-lg font-bold">{t("invite.invalidTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("invite.invalidText")}</p>
          </div>
        ) : !info ? (
          <p className="text-center text-sm text-primary-100">{t("common.loading")}</p>
        ) : (
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="text-lg font-bold">{t("invite.title", { label: info.label })}</h2>
              <p className="mt-1 text-sm text-muted">
                {t("invite.intro", { date: new Date(info.expires_at).toLocaleDateString(dateLocale, { day: "numeric", month: "long" }) })}
              </p>
              <button className="btn-accent mt-4 w-full" onClick={tryDemo} disabled={busy}>
                <PlayCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                {info.demo_active ? t("invite.continueDemo") : t("invite.tryDemo")}
              </button>
              <p className="mt-2 text-xs text-muted">{t("invite.demoHint")}</p>
            </div>
            <div className="card space-y-4 p-6">
              <h2 className="text-lg font-bold">{t("invite.createTitle")}</h2>
              {field("family_name", t("login.familyName"), { placeholder: t("login.familyNamePh") })}
              {field("display_name", t("login.yourName"))}
              {field("email", t("login.email"), { type: "email", autoComplete: "email" })}
              {field("username", t("login.username"), { autoCapitalize: "none", autoComplete: "off" })}
              {field("password", t("login.password"), { type: "password", autoComplete: "new-password" })}
              <p className="text-xs text-muted">{t("invite.privacy")}</p>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                className="btn-primary w-full"
                onClick={create}
                disabled={busy || !ready}
              >
                {t("login.createFamily")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
