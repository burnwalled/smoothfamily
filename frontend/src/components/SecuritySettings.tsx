"use client";

// Profile → Security: the user's own passkeys and authenticator app.
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import TotpEnrollment, { CodeInput, TotpSetup } from "@/components/TotpEnrollment";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { createPasskey, guessDeviceName, passkeysSupported } from "@/lib/webauthn";

type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };
type Security = {
  passkeys_enabled: boolean;
  totp_policy: "off" | "optional" | "required";
  totp_enabled: boolean;
  totp_required: boolean;
  passkeys: Passkey[];
};

export default function SecuritySettings() {
  const { t, dateLocale } = useI18n();
  const [security, setSecurity] = useState<Security | null>(null);
  const [enrolment, setEnrolment] = useState<TotpSetup | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api.live<Security>("/api/auth/security", setSecurity).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? t("mfa.wrongCode") : e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const addPasskey = () =>
    run(async () => {
      const name = window.prompt(t("security.passkeyNamePrompt"), guessDeviceName());
      if (!name?.trim()) return;
      const { challenge_id, options } = await api.post<{ challenge_id: string; options: Record<string, unknown> }>(
        "/api/auth/passkeys/register/options"
      );
      let credential;
      try {
        credential = await createPasskey(options);
      } catch {
        return; // cancelled in the system dialog
      }
      await api.post("/api/auth/passkeys/register/verify", { challenge_id, credential, name: name.trim() });
      setNotice(t("security.passkeyAdded"));
      load();
    });

  const removePasskey = (passkey: Passkey) =>
    run(async () => {
      if (!confirm(t("common.confirmRemove", { name: passkey.name }))) return;
      await api.del(`/api/auth/passkeys/${passkey.id}`);
      load();
    });

  const startTotp = () =>
    run(async () => {
      setEnrolment(await api.post<TotpSetup>("/api/auth/totp/setup"));
    });

  const confirmTotp = (code: string) =>
    run(async () => {
      await api.post("/api/auth/totp/enable", { code });
      setEnrolment(null);
      setNotice(t("security.totpEnabled"));
      load();
    });

  const disableTotp = () =>
    run(async () => {
      await api.post("/api/auth/totp/disable", { code: disableCode });
      setDisabling(false);
      setDisableCode("");
      load();
    });

  if (!security) return null;
  const showPasskeys = security.passkeys_enabled;
  const showTotp = security.totp_policy !== "off";
  if (!showPasskeys && !showTotp) return null;

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="card mt-4 space-y-6 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("security.title")}</h2>

      {showPasskeys && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("security.passkeys")}
          </h3>
          <p className="mt-1 text-xs text-muted">{t("security.passkeysHint")}</p>
          {security.passkeys.length > 0 && (
            <ul className="mt-3 space-y-2">
              {security.passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center gap-3 rounded-lg border border-edge px-3 py-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pk.name}</p>
                    <p className="text-xs text-muted">
                      {t("security.added", { date: formatDate(pk.created_at) })}
                      {pk.last_used_at ? ` · ${t("security.lastUsed", { date: formatDate(pk.last_used_at) })}` : ""}
                    </p>
                  </div>
                  <button
                    className="rounded p-1.5 text-muted hover:bg-base hover:text-red-700"
                    onClick={() => removePasskey(pk)}
                    aria-label={t("common.remove")}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {passkeysSupported() ? (
            <button className="btn-ghost mt-3 inline-flex items-center gap-1.5 border border-edge" onClick={addPasskey} disabled={busy}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("security.addPasskey")}
            </button>
          ) : (
            <p className="mt-3 text-xs text-muted">{t("security.passkeysUnsupported")}</p>
          )}
        </div>
      )}

      {showTotp && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("security.totpTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted">{t("security.totpHint")}</p>

          {security.totp_enabled ? (
            <div className="mt-3 space-y-3">
              <p className="flex items-center gap-1.5 text-sm text-green-700">
                <ShieldCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("security.totpOn")}
              </p>
              {security.totp_required ? (
                <p className="text-xs text-muted">{t("security.totpRequiredNote")}</p>
              ) : disabling ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (disableCode.length === 6) disableTotp();
                  }}
                >
                  <p className="text-xs text-muted">{t("security.totpDisableHint")}</p>
                  <CodeInput value={disableCode} onChange={setDisableCode} autoFocus />
                  <div className="flex gap-2">
                    <button className="btn-primary" type="submit" disabled={busy || disableCode.length !== 6}>
                      {t("security.totpDisable")}
                    </button>
                    <button className="btn-ghost" type="button" onClick={() => setDisabling(false)}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <button className="text-xs text-red-700 hover:underline" onClick={() => setDisabling(true)}>
                  {t("security.totpDisable")}
                </button>
              )}
            </div>
          ) : enrolment ? (
            <div className="mt-3 max-w-sm">
              <TotpEnrollment setup={enrolment} busy={busy} error={error} onConfirm={confirmTotp} />
              <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => setEnrolment(null)}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button className="btn-ghost mt-3 border border-edge" onClick={startTotp} disabled={busy}>
              {t("security.totpEnable")}
            </button>
          )}
        </div>
      )}

      {notice && <p className="text-sm text-green-700">{notice}</p>}
      {error && !enrolment && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
