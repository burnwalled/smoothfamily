"use client";

// Accepting the invitation as the other parent (2.8.3): choose a username and a password.
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

type Info = { family_name: string; name: string; children: string[] };

export default function CoParentJoin() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [info, setInfo] = useState<Info | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/coparent/invite/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setInvalid(true));
  }, [token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const resp = await fetch(`/api/coparent/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
      credentials: "same-origin",
    });
    if (resp.ok) {
      router.replace("/coparent");
      return;
    }
    const detail = await resp.json().catch(() => null);
    setError(typeof detail?.detail === "string" ? detail.detail : t("common.error"));
  }

  return (
    <div className="min-h-screen bg-base px-4 py-8">
      {invalid ? (
        <div className="card mx-auto max-w-sm p-6 text-center">
          <h1 className="text-lg font-bold">{t("invite.invalidTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("coparent.inviteInvalid")}</p>
        </div>
      ) : !info ? (
        <p className="text-center text-sm text-muted">{t("common.loading")}</p>
      ) : (
        <form className="card mx-auto max-w-sm space-y-3 p-6" onSubmit={join}>
          <h1 className="text-xl font-bold">{t("guests.hello", { name: info.name })}</h1>
          <p className="text-sm text-muted">{t("coparent.joinHint", { family: info.family_name, children: info.children.join(", ") })}</p>
          <label className="block text-sm">
            {t("coparent.username")}
            <input className="input mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="block text-sm">
            {t("coparent.password")}
            <input className="input mt-1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={username.trim().length < 3 || password.length < 4}>
            {t("coparent.join")}
          </button>
        </form>
      )}
    </div>
  );
}
