"use client";

// Server settings → Security (2.8.2): passkeys, two-step codes and how long passwords must be – the
// same for every family on the server.
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Policy = { passkeys_enabled: boolean; totp_policy: "off" | "optional" | "required"; password_min_adult: number; password_min_child: number };

export default function ServerSecurity() {
  const { t } = useI18n();
  const policy = useApi<Policy>("/api/admin/security-policy").data ?? null;
  const setPolicy = (next: Policy) => setApiData<Policy>("/api/admin/security-policy", () => next);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(next: Policy) {
    setError("");
    setSaved(false);
    setPolicy(next);
    try {
      setPolicy(await api.put<Policy>("/api/admin/security-policy", next));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!policy) return <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>;
  const length = (key: "password_min_adult" | "password_min_child", label: string) => (
    <label className="block text-sm">
      {label}
      <select className="input mt-1" value={policy[key]} onChange={(e) => save({ ...policy, [key]: Number(e.target.value) })}>
        {[4, 6, 8, 10, 12, 14, 16].map((n) => (
          <option key={n} value={n}>
            {t(n === 12 ? "server.passwordRecommended" : "server.passwordChars", { n })}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="card mt-4 space-y-4 p-5" aria-label={t("server.tab.security")}>
      <p className="text-sm text-muted">{t("server.securityIntro")}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={policy.passkeys_enabled} onChange={(e) => save({ ...policy, passkeys_enabled: e.target.checked })} />
        <span>
          <span className="font-medium">{t("security.allowPasskeys")}</span>
          <span className="block text-xs text-muted">{t("security.allowPasskeysHint")}</span>
        </span>
      </label>
      <div className="max-w-sm">
        <label className="label" htmlFor="server-totp">{t("security.totpPolicy")}</label>
        <select id="server-totp" className="input" value={policy.totp_policy} onChange={(e) => save({ ...policy, totp_policy: e.target.value as Policy["totp_policy"] })}>
          <option value="off">{t("security.totp.off")}</option>
          <option value="optional">{t("security.totp.optional")}</option>
          <option value="required">{t("security.totp.required")}</option>
        </select>
        <p className="mt-1 text-xs text-muted">{t("security.totpPolicyHint")}</p>
      </div>
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {length("password_min_adult", t("server.passwordAdults"))}
        {length("password_min_child", t("server.passwordChildren"))}
      </div>
      <p className="text-xs text-muted">{t("server.passwordHint")}</p>
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-green-700" role="status">
          <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("home.saved")}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
