"use client";

// Server → Address and services → E-mail (3.4.0): the services the server sends mail with – Gmail
// (an app password), Brevo (its SMTP key, from a verified address), Exchange Online (an app
// registration, through Microsoft Graph) or any SMTP server – and which
// of them the family running the server uses, and which the hosted families may use. Used for a
// party's guests who ask for updates. Passwords are stored encrypted and never shown again.
import { useEffect, useState } from "react";
import { ChevronDown, CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Provider = "gmail" | "brevo" | "exchange" | "smtp";
type Account = { configured: boolean; host?: string; port?: number; security?: string; username?: string; sender?: string; sender_name?: string; has_password?: boolean; tenant_id?: string; client_id?: string };
type Email = { accounts: Record<Provider, Account>; owner: Provider | ""; hosted: Provider | "" };
const PATH = "/api/admin/integrations/email";
const PROVIDERS: Provider[] = ["gmail", "brevo", "exchange", "smtp"];

function ProviderCard({ provider, account }: { provider: Provider; account: Account }) {
  const { t } = useI18n();
  const blank = { host: "", port: 587, security: "starttls", username: "", password: "", sender: "", sender_name: "Smooth Family", tenant_id: "", client_id: "" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [test, setTest] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (account.configured) setForm({ host: account.host ?? "", port: account.port ?? 587, security: account.security ?? "starttls", username: account.username ?? "", sender: account.sender ?? "", sender_name: account.sender_name ?? "", password: "", tenant_id: account.tenant_id ?? "", client_id: account.client_id ?? "" });
  }, [account]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function run(action: () => Promise<unknown>, done: string) {
    setError("");
    setNote("");
    try {
      await action();
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }
  const keep = (r: unknown) => setApiData<Email>(PATH, () => r as Email);
  const ready = provider === "exchange" ? !!form.tenant_id.trim() && !!form.client_id.trim() && form.sender.includes("@") && (!!form.password || !!account.has_password) : provider === "smtp" ? !!form.host.trim() && form.sender.includes("@") : provider === "gmail" ? form.username.includes("@") && (!!form.password || !!account.has_password) : !!form.username && form.sender.includes("@") && (!!form.password || !!account.has_password);

  return (
    <div className="rounded-xl border border-edge" role="group" aria-label={t(`server.email.${provider}` as TranslationKey)}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="flex-1 text-sm font-semibold">{t(`server.email.${provider}` as TranslationKey)}</span>
        {account.configured && <span className="flex items-center gap-1 text-xs text-green-700"><CircleCheck className="h-3.5 w-3.5" aria-hidden />{account.sender}</span>}
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-edge p-3">
          <p className="text-xs text-muted">{t(`server.email.${provider}Help` as TranslationKey)}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {provider === "smtp" && (
              <>
                <label><span className="label">{t("server.email.host")}</span><input className="input" value={form.host} placeholder="smtp.example.com" onChange={(e) => set({ host: e.target.value })} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label><span className="label">{t("server.email.port")}</span><input className="input" type="number" value={form.port} onChange={(e) => set({ port: Number(e.target.value) })} /></label>
                  <label>
                    <span className="label">{t("server.email.security")}</span>
                    <select className="input" value={form.security} onChange={(e) => set({ security: e.target.value, port: e.target.value === "ssl" ? 465 : e.target.value === "starttls" ? 587 : 25 })}>
                      <option value="starttls">STARTTLS</option>
                      <option value="ssl">SSL/TLS</option>
                      <option value="none">{t("server.email.none")}</option>
                    </select>
                  </label>
                </div>
              </>
            )}
            {provider === "exchange" ? (
              <>
                <label><span className="label">{t("server.email.tenantId")}</span><input className="input" autoComplete="off" value={form.tenant_id} placeholder="contoso.onmicrosoft.com" onChange={(e) => set({ tenant_id: e.target.value.trim() })} /></label>
                <label><span className="label">{t("server.email.clientId")}</span><input className="input" autoComplete="off" value={form.client_id} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => set({ client_id: e.target.value.trim() })} /></label>
              </>
            ) : (
              <label>
                <span className="label">{t(provider === "gmail" ? "server.email.gmailAddress" : provider === "brevo" ? "server.email.brevoLogin" : "server.email.username")}</span>
                <input className="input" autoComplete="off" value={form.username} placeholder={provider === "gmail" ? "namn@gmail.com" : ""} onChange={(e) => set({ username: e.target.value })} />
              </label>
            )}
            <label>
              <span className="label">{t(provider === "exchange" ? "server.email.clientSecret" : provider === "gmail" ? "server.email.appPassword" : provider === "brevo" ? "server.email.brevoKey" : "server.email.password")}</span>
              <input className="input" type="password" autoComplete="new-password" value={form.password} placeholder={account.has_password ? t("server.email.passwordKept") : ""} onChange={(e) => set({ password: e.target.value })} />
            </label>
            {provider !== "gmail" && (
              <label><span className="label">{t(provider === "exchange" ? "server.email.mailbox" : "server.email.sender")}</span><input className="input" type="email" value={form.sender} placeholder="fest@example.com" onChange={(e) => set({ sender: e.target.value })} /></label>
            )}
            {provider !== "exchange" && <label><span className="label">{t("server.email.senderName")}</span><input className="input" value={form.sender_name} onChange={(e) => set({ sender_name: e.target.value })} /></label>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={!ready} onClick={() => run(() => api.put(`${PATH}/${provider}`, { ...form, password: form.password || null }).then(keep), t("server.email.saved"))}>
              {t("server.email.save")}
            </button>
            {account.configured && <button className="text-xs text-red-700 hover:underline" onClick={() => run(() => api.del(`${PATH}/${provider}`).then(keep), t("server.email.removed"))}>{t("server.email.remove")}</button>}
          </div>
          {account.configured && (
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => api.post(`${PATH}/test`, { provider, to: test }), t("server.email.testSent", { to: test })); }}>
              <input className="input !w-64" type="email" placeholder={t("server.email.testTo")} aria-label={t("server.email.testTo")} value={test} onChange={(e) => setTest(e.target.value)} />
              <button className="btn-ghost border border-edge" type="submit" disabled={!test.includes("@")}>{t("server.email.test")}</button>
            </form>
          )}
          {note && <p className="text-sm text-accent" role="status">{note}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function EmailSettings() {
  const { t } = useI18n();
  const saved = useApi<Email>(PATH).data;
  const [error, setError] = useState("");
  if (!saved) return null;
  const ready = PROVIDERS.filter((p) => saved.accounts[p]?.configured);
  const use = (patch: Partial<Pick<Email, "owner" | "hosted">>) => {
    setError("");
    api.put<Email>("/api/admin/integrations/email-use", { owner: saved.owner, hosted: saved.hosted, ...patch }).then((r) => setApiData<Email>(PATH, () => r)).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  };
  const choice = (who: "owner" | "hosted") => (
    <label>
      <span className="label">{t(who === "owner" ? "server.email.ownerUses" : "server.email.hostedUse")}</span>
      <select className="input" value={saved[who]} disabled={ready.length === 0} onChange={(e) => use({ [who]: e.target.value as Provider | "" })}>
        <option value="">{t(who === "owner" ? "server.email.noMail" : "server.email.hostedNone")}</option>
        {ready.map((p) => <option key={p} value={p}>{`${t(`server.email.${p}` as TranslationKey)} – ${saved.accounts[p].sender}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="mt-6" role="group" aria-label={t("server.email.title")}>
      <h3 className="text-sm font-semibold">{t("server.email.title")}</h3>
      <p className="mt-1 text-xs text-muted">{t("server.email.help")}</p>
      <div className="mt-3 space-y-2">
        {PROVIDERS.map((p) => <ProviderCard key={p} provider={p} account={saved.accounts[p] ?? { configured: false }} />)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {choice("owner")}
        {choice("hosted")}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
