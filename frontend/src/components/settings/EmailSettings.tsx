"use client";

// Server → Address and services → E-mail (3.4.0): the SMTP server the server sends from – the
// family's own mail provider or a relay. Used for a party's guests who ask for updates. The password
// is stored encrypted and never shown again; a test mail says at once whether it works.
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { setApiData, useApi } from "@/lib/query";

type Email = { configured: boolean; host?: string; port?: number; security?: string; username?: string; sender?: string; sender_name?: string; has_password?: boolean };
const PATH = "/api/admin/integrations/email";

export default function EmailSettings() {
  const { t } = useI18n();
  const saved = useApi<Email>(PATH).data;
  const [form, setForm] = useState({ host: "", port: 587, security: "starttls", username: "", password: "", sender: "", sender_name: "Smooth Family" });
  const [test, setTest] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (saved?.configured) setForm((f) => ({ ...f, host: saved.host ?? "", port: saved.port ?? 587, security: saved.security ?? "starttls", username: saved.username ?? "", sender: saved.sender ?? "", sender_name: saved.sender_name ?? "", password: "" }));
  }, [saved]);
  if (!saved) return null;

  async function run(action: () => Promise<unknown>, done: string) {
    setError("");
    setNote("");
    try {
      await action();
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-6" role="group" aria-label={t("server.email.title")}>
      <h3 className="text-sm font-semibold">{t("server.email.title")}</h3>
      <p className="mt-1 text-xs text-muted">{t("server.email.help")}</p>
      {saved.configured && <p className="mt-2 flex items-center gap-1.5 text-sm"><CircleCheck className="h-4 w-4 text-green-600" aria-hidden />{t("server.email.on", { sender: saved.sender ?? "" })}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label><span className="label">{t("server.email.host")}</span><input className="input" value={form.host} placeholder="smtp.example.com" onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="label">{t("server.email.port")}</span><input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></label>
          <label>
            <span className="label">{t("server.email.security")}</span>
            <select className="input" value={form.security} onChange={(e) => setForm({ ...form, security: e.target.value, port: e.target.value === "ssl" ? 465 : e.target.value === "starttls" ? 587 : 25 })}>
              <option value="starttls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="none">{t("server.email.none")}</option>
            </select>
          </label>
        </div>
        <label><span className="label">{t("server.email.username")}</span><input className="input" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label><span className="label">{t("server.email.password")}</span><input className="input" type="password" autoComplete="new-password" value={form.password} placeholder={saved.has_password ? t("server.email.passwordKept") : ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label><span className="label">{t("server.email.sender")}</span><input className="input" type="email" value={form.sender} placeholder="fest@example.com" onChange={(e) => setForm({ ...form, sender: e.target.value })} /></label>
        <label><span className="label">{t("server.email.senderName")}</span><input className="input" value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!form.host.trim() || !form.sender.includes("@")} onClick={() => run(() => api.put<Email>(PATH, { ...form, password: form.password || null }).then((r) => setApiData<Email>(PATH, () => r)), t("server.email.saved"))}>
          {t("server.email.save")}
        </button>
        {saved.configured && <button className="text-xs text-red-700 hover:underline" onClick={() => run(() => api.del(PATH).then(() => setApiData<Email>(PATH, () => ({ configured: false }))), t("server.email.removed"))}>{t("server.email.remove")}</button>}
      </div>
      {saved.configured && (
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => api.post(`${PATH}/test`, { to: test }), t("server.email.testSent", { to: test })); }}>
          <input className="input !w-64" type="email" placeholder={t("server.email.testTo")} aria-label={t("server.email.testTo")} value={test} onChange={(e) => setTest(e.target.value)} />
          <button className="btn-ghost border border-edge" type="submit" disabled={!test.includes("@")}>{t("server.email.test")}</button>
        </form>
      )}
      {note && <p className="mt-2 text-sm text-accent" role="status">{note}</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
