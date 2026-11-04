"use client";

// A new login in the vault, made from somewhere else (a subscription): the vault's own rules, it's
// the person's own, and it stays theirs unless they share it. No <form>: this may sit beside another.
import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { api, Member, VaultLogin } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import { generatePassword } from "@/components/vault/Passwords";

export default function NewLogin({ title, url, onCreated, onCancel }: { title: string; url: string; onCreated: (login: VaultLogin) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const others = (useApi<Member[]>("/api/family/members").data ?? NONE).filter((m) => m.role !== "child" && m.id !== me.id);
  const [form, setForm] = useState({ title, url, username: "", password: generatePassword(), shared_with: [] as string[] });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      const login = await api.post<VaultLogin>("/api/vault/logins", { ...form, title: form.title.trim(), url: form.url.trim(), notes: "" });
      setApiData<VaultLogin[]>("/api/vault/logins", (old) => [...(old ?? []), login]);
      onCreated(login);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-edge p-3 text-sm" aria-label={t("vault.addLogin")}>
      <label className="block">{t("vault.loginTitle")}<input className="input mt-1" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="block">{t("vault.url")}<input className="input mt-1" type="url" inputMode="url" value={form.url} placeholder="https://" onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
      <label className="block">{t("vault.username")}<input className="input mt-1" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
      <div>
        <label htmlFor="new-login-password">{t("vault.password")}</label>
        <div className="mt-1 flex gap-2">
          <input id="new-login-password" className="input min-w-0 flex-1 font-mono" type={show ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button type="button" className="btn" onClick={() => setShow((v) => !v)} aria-label={show ? t("vault.hide") : t("vault.show")}>{show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}</button>
          <button type="button" className="btn" onClick={() => { setForm({ ...form, password: generatePassword() }); setShow(true); }} aria-label={t("vault.generate")} title={t("vault.generate")}><RefreshCw className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
      {others.length > 0 && (
        <fieldset>
          <legend>{t("vault.shareWith")}</legend>
          <p className="text-xs text-muted">{t("vault.shareHelp")}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {others.map((a) => (
              <label key={a.id} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={form.shared_with.includes(a.id)} onChange={(e) => setForm({ ...form, shared_with: e.target.checked ? [...form.shared_with, a.id] : form.shared_with.filter((x) => x !== a.id) })} />
                {a.display_name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="text-red-600" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!form.title.trim()} onClick={() => { void save(); }}>{t("subs.saveLogin")}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </section>
  );
}
