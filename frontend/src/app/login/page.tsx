"use client";

// Sign-in + first-run setup in the same view. Sign-in can continue with an
// authenticator code (or a forced authenticator setup) when the family's
// policy asks for one; passkeys skip that step.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import TotpEnrollment, { CodeInput, TotpSetup } from "@/components/TotpEnrollment";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fieldErrors } from "@/lib/fieldErrors";
import { getPasskey, passkeysSupported } from "@/lib/webauthn";

type SetupStatus = { needs_setup: boolean; requires_code?: boolean; passkeys_enabled?: boolean; password_min?: number };
type MfaChallenge = { mfa_required: true; totp_setup_required: boolean; mfa_token: string };
type TotpPolicy = "off" | "optional" | "required";

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [allowPasskeys, setAllowPasskeys] = useState(true);
  const [totpPolicy, setTotpPolicy] = useState<TotpPolicy>("optional");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [enrolment, setEnrolment] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canUsePasskeys, setCanUsePasskeys] = useState(false);

  useEffect(() => {
    api.get<SetupStatus>("/api/auth/setup").then(setStatus);
    setCanUsePasskeys(passkeysSupported());
  }, []);

  function showError(e: unknown) {
    if (e instanceof ApiError && e.status === 429) setError(t("login.tooManyAttempts"));
    else if (e instanceof ApiError && e.status === 401 && challenge) setError(t("mfa.wrongCode"));
    else if (e instanceof ApiError && e.status === 401) setError(t("login.wrongCredentials"));
    else if (e instanceof ApiError && e.status === 403 && status?.needs_setup) setError(t("login.wrongSetupCode"));
    else setError(fieldErrors(e, t) ?? (e instanceof Error ? e.message : t("common.error")));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (status?.needs_setup) {
        await api.post("/api/auth/setup", {
          family_name: familyName,
          display_name: displayName,
          email: email.trim(),
          username,
          password,
          setup_code: status.requires_code ? setupCode.trim() : undefined,
          passkeys_enabled: allowPasskeys,
          totp_policy: totpPolicy,
        });
        router.replace("/");
        return;
      }
      const result = await api.post<MfaChallenge | { username: string }>("/api/auth/login", { username, password });
      if ("mfa_required" in result) {
        setChallenge(result);
        if (result.totp_setup_required) {
          setEnrolment(await api.post<TotpSetup>("/api/auth/login/totp/setup", { mfa_token: result.mfa_token }));
        }
        return;
      }
      router.replace("/");
    });

  const submitCode = (value: string) =>
    run(async () => {
      if (!challenge) return;
      const path = enrolment ? "/api/auth/login/totp/enable" : "/api/auth/login/totp";
      await api.post(path, { mfa_token: challenge.mfa_token, code: value });
      router.replace("/");
    });

  const signInWithPasskey = () =>
    run(async () => {
      const { challenge_id, options } = await api.post<{ challenge_id: string; options: Record<string, unknown> }>(
        "/api/auth/passkeys/login/options"
      );
      let credential;
      try {
        credential = await getPasskey(options);
      } catch {
        return; // cancelled in the system dialog – nothing to report
      }
      await api.post("/api/auth/passkeys/login/verify", { challenge_id, credential });
      router.replace("/");
    });

  if (status === null) {
    return <div className="min-h-screen grid place-items-center text-muted">{t("common.loading")}</div>;
  }

  const needsSetup = status.needs_setup;

  return (
    <div className="min-h-screen grid place-items-center bg-primary-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Smooth Family</h1>
          <p className="mt-1 text-sm text-primary-100/70">{t("login.tagline")}</p>
        </div>

        {challenge ? (
          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">{enrolment ? t("mfa.setupRequiredTitle") : t("mfa.enterCodeTitle")}</h2>
            {enrolment ? (
              <>
                <p className="text-sm text-muted">{t("mfa.setupRequiredBody")}</p>
                <TotpEnrollment setup={enrolment} busy={busy} error={error} onConfirm={submitCode} />
              </>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.length === 6) submitCode(code);
                }}
              >
                <p className="text-sm text-muted">{t("mfa.enterCodeBody")}</p>
                <CodeInput value={code} onChange={setCode} autoFocus />
                {error && <p className="text-sm text-red-700">{error}</p>}
                <button className="btn-primary w-full" type="submit" disabled={busy || code.length !== 6}>
                  {t("login.signIn")}
                </button>
              </form>
            )}
            <button
              className="w-full text-center text-xs text-muted hover:text-ink"
              onClick={() => {
                setChallenge(null);
                setEnrolment(null);
                setCode("");
                setError("");
              }}
            >
              {t("mfa.startOver")}
            </button>
          </div>
        ) : (
          <div className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">{needsSetup ? t("login.welcome") : t("login.signIn")}</h2>
            {needsSetup && (
              <div className="rounded-lg border border-accent bg-accent-soft p-3">
                <p className="text-sm">{t("login.demoIntro")}</p>
                <button
                  className="btn-accent mt-2 w-full"
                  disabled={busy || (status.requires_code && !setupCode.trim())}
                  onClick={() =>
                    run(async () => {
                      await api.post("/api/auth/setup/demo", { language: locale, setup_code: status.requires_code ? setupCode.trim() : undefined });
                      router.replace("/");
                    })
                  }
                >
                  {t("login.tryDemo")}
                </button>
                {status.requires_code && <p className="mt-1 text-xs text-muted">{t("login.demoNeedsCode")}</p>}
              </div>
            )}
            {needsSetup && (
              <>
                {status.requires_code && (
                  <div>
                    <label className="label">{t("login.setupCode")}</label>
                    <input
                      className="input font-mono"
                      autoCapitalize="none"
                      autoComplete="off"
                      value={setupCode}
                      onChange={(e) => setSetupCode(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted">{t("login.setupCodeHint")}</p>
                  </div>
                )}
                <div>
                  <label className="label">{t("login.familyName")}</label>
                  <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder={t("login.familyNamePh")} />
                </div>
                <div>
                  <label className="label">{t("login.yourName")}</label>
                  <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div>
                  <label className="label">{t("login.email")}</label>
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted">{t("login.emailHint")}</p>
                </div>
              </>
            )}
            <div>
              <label className="label" htmlFor="login-username">{t("login.username")}</label>
              <input
                id="login-username"
                className="input"
                autoCapitalize="none"
                autoComplete={needsSetup ? "off" : "username webauthn"}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">{t("login.password")}</label>
              <input
                id="login-password"
                className="input"
                type="password"
                autoComplete={needsSetup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              {needsSetup && <p className="mt-1 text-xs text-muted">{t("login.passwordHint", { n: status.password_min ?? 12 })}</p>}
            </div>

            {needsSetup && (
              <fieldset className="space-y-3 rounded-lg border border-edge p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("security.title")}</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-primary-700"
                    checked={allowPasskeys}
                    onChange={(e) => setAllowPasskeys(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">{t("security.allowPasskeys")}</span>
                    <span className="block text-xs text-muted">{t("security.allowPasskeysHint")}</span>
                  </span>
                </label>
                <div>
                  <label className="label">{t("security.totpPolicy")}</label>
                  <select className="input" value={totpPolicy} onChange={(e) => setTotpPolicy(e.target.value as TotpPolicy)}>
                    <option value="off">{t("security.totp.off")}</option>
                    <option value="optional">{t("security.totp.optional")}</option>
                    <option value="required">{t("security.totp.required")}</option>
                  </select>
                  <p className="mt-1 text-xs text-muted">{t("security.totpPolicyHint")}</p>
                </div>
              </fieldset>
            )}

            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full" onClick={submit} disabled={busy}>
              {needsSetup ? t("login.createFamily") : t("login.signIn")}
            </button>

            {!needsSetup && status.passkeys_enabled && canUsePasskeys && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-edge" />
                  {t("login.or")}
                  <span className="h-px flex-1 bg-edge" />
                </div>
                <button className="btn-ghost flex w-full items-center justify-center gap-2 border border-edge" onClick={signInWithPasskey} disabled={busy}>
                  <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {t("login.withPasskey")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
