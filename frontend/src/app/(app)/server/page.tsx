"use client";

// The server: families on this server, invitations, moving a family, backups and the server log.
// Only for the server's admin. Shows names, counts and sizes – never another family's content.
import { useEffect, useState } from "react";
import Link from "next/link";
import PageTitle from "@/components/PageTitle";
import TabNav from "@/components/TabNav";
import { Copy, Download, Mail, Pause, Play, Server, Sparkles, Trash2, Upload } from "lucide-react";
import { api, Invitation, ServerFamily, ServerLogRow } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, refreshResource, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import BackupsPanel from "@/components/BackupsPanel";
import BackupKey from "@/components/settings/BackupKey";
import FamilyBackups from "@/components/settings/FamilyBackups";
import { ServerAiPanel } from "@/components/LocalAi";
import DiskUsage from "@/components/settings/DiskUsage";
import FileLimit from "@/components/settings/FileLimit";
import ServerAddress from "@/components/settings/ServerAddress";
import ServerSecurity, { SecurityLog } from "@/components/settings/ServerSecurity";
import ServerUpdates from "@/components/settings/ServerUpdates";
import ServerServices from "@/components/settings/ServerServices";
import ServerReports from "@/components/settings/ServerReports";
import ServerDevices from "@/components/settings/ServerDevices";

const LIFETIMES = [1, 7, 14, 30, 90];

function size(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const SERVER_TABS = ["families", "devices", "reports", "security", "data", "updates", "ai", "services", "log"] as const;

export default function ServerPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [tab, setTab] = useState<(typeof SERVER_TABS)[number]>("families");
  // A notification opens its tab (?tab=reports).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && (SERVER_TABS as readonly string[]).includes(wanted)) setTab(wanted as (typeof SERVER_TABS)[number]);
  }, []);
  // From the cache: every change on this page goes through api.* and invalidates the server's data.
  const families = useApi<ServerFamily[]>("/api/server/families").data ?? NONE;
  const invitations = useApi<Invitation[]>("/api/server/invitations").data ?? NONE;
  const log = useApi<ServerLogRow[]>("/api/server/log").data ?? NONE;
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(7);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<Record<string, number>>({});
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPass, setImportPass] = useState("");
  const [message, setMessage] = useState("");
  // The family whose own backups are open.
  const [backupsFor, setBackupsFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, done = "") {
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (!me.is_server_admin) return <p className="text-sm text-muted">{t("server.onlyAdmin")}</p>;

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" }) : "–");
  const absolute = (url: string) => (url.startsWith("http") ? url : `${window.location.origin}${url}`);
  const stateLabel: Record<string, string> = {
    open: t("server.stateOpen"),
    used: t("server.stateUsed"),
    expired: t("server.stateExpired"),
    revoked: t("server.stateRevoked"),
  };
  const kindLabel: Record<string, string> = { owner: t("server.kindOwner"), hosted: t("server.kindHosted"), demo: t("server.kindDemo") };

  async function exportFamily(f: ServerFamily) {
    const passphrase = prompt(t("server.exportPrompt", { name: f.name }));
    if (!passphrase) return;
    if (passphrase.length < 10) {
      setError(t("server.passphraseShort"));
      return;
    }
    const resp = await fetch(`/api/server/families/${f.id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
      credentials: "same-origin",
    });
    if (!resp.ok) {
      setError(t("common.error"));
      return;
    }
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${f.name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.sfmove`;
    a.click();
    URL.revokeObjectURL(a.href);
    // The export went past api.post: it is in the server's log now.
    void refreshResource("server");
  }

  async function importFamily() {
    if (!importFile) return;
    await run(async () => {
      const resp = await fetch(`/api/server/families/import?passphrase=${encodeURIComponent(importPass)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await importFile.arrayBuffer(),
        credentials: "same-origin",
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).detail ?? t("common.error"));
      setImportFile(null);
      setImportPass("");
    }, t("server.imported"));
  }

  return (
    <>
      <TabNav label={t("server.title")} tabs={SERVER_TABS.map((x) => ({ key: x, label: t(`server.tab.${x}` as TranslationKey), current: tab === x, onClick: () => setTab(x) }))} />
      <PageTitle title={t("server.title")} icon={Server} />
      <p className="mt-1 text-sm text-muted">{t("server.intro")}</p>
      <Link href="/welcome?guide=server" className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
        <Sparkles className="h-4 w-4" aria-hidden />
        {t("guide.open")}
      </Link>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}

      {tab === "families" && (
        <>
      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("server.families")}</h2>
        <ul className="divide-y divide-edge">
          {families.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
              <span className="min-w-40 flex-1">
                <span className="font-semibold">{f.name}</span>
                <span className="ml-2 rounded-full bg-base px-2 py-0.5 text-[11px] text-muted">{kindLabel[f.kind] ?? f.kind}</span>
                {f.status === "suspended" && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{t("server.paused")}</span>}
                <span className="block text-xs text-muted">
                  {t("server.familyStats", { members: f.members, size: size(f.storage_bytes), since: when(f.created_at), active: when(f.last_activity) })}
                  {f.storage_quota_mb !== null && (
                    <span className={f.storage_bytes > f.storage_quota_mb * 1024 * 1024 * 0.9 ? " font-semibold text-red-700" : ""}> · {t("server.ofQuota", { quota: size(f.storage_quota_mb * 1024 * 1024) })}</span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  onClick={() => {
                    const typed = prompt(t("server.quotaPrompt", { name: f.name }), f.storage_quota_mb ? String(f.storage_quota_mb / 1024) : "");
                    if (typed === null) return;
                    const gb = Number(typed.replace(",", "."));
                    run(() => api.put(`/api/server/families/${f.id}/quota`, { quota_mb: typed.trim() === "" || !(gb > 0) ? null : Math.round(gb * 1024) }));
                  }}
                >
                  {t("server.quota")}
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setBackupsFor((v) => (v === f.id ? null : f.id))} aria-expanded={backupsFor === f.id}>
                  {t("server.familyBackups")}
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => exportFamily(f)} title={t("server.exportHint")}>
                  <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t("server.export")}
                </button>
                {!f.yours && (
                  <>
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => run(() => api.put(`/api/server/families/${f.id}/status`, { status: f.status === "active" ? "suspended" : "active" }))}
                    >
                      {f.status === "active" ? <Pause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                      {f.status === "active" ? t("server.pause") : t("server.resume")}
                    </button>
                    <button
                      className="rounded px-2 py-1 text-xs text-red-700 hover:bg-base"
                      onClick={() => {
                        const typed = prompt(t("server.deletePrompt", { name: f.name }));
                        if (typed !== null) run(() => api.del(`/api/server/families/${f.id}?confirm=${encodeURIComponent(typed)}`), t("server.deleted", { name: f.name }));
                      }}
                      aria-label={t("server.delete", { name: f.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </>
                )}
              </span>
              {backupsFor === f.id && <FamilyBackups family={f} onDone={(m) => setMessage(m)} />}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("server.invitations")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("server.invitationsHint")}</p>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1" placeholder={t("server.invitePh")} value={label} onChange={(e) => setLabel(e.target.value)} aria-label={t("server.invitePh")} />
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t("server.lifetime")}>
            {LIFETIMES.map((d) => <option key={d} value={d}>{t("server.validDays", { n: d })}</option>)}
          </select>
          <button
            className="btn-primary"
            disabled={!label.trim()}
            onClick={() =>
              run(async () => {
                const created = await api.post<Invitation & { url: string }>("/api/server/invitations", { label: label.trim(), days });
                setLabel("");
                setNewLink(absolute(created.url));
              })
            }
          >
            {t("server.createInvite")}
          </button>
        </div>
        {newLink && (
          <div className="mt-3 rounded-lg border border-accent bg-accent-soft p-3 text-sm">
            <p className="font-semibold">{t("server.linkOnce")}</p>
            <div className="mt-2 flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={newLink} onFocus={(e) => e.target.select()} aria-label={t("server.link")} />
              <button className="btn-ghost border border-edge" onClick={() => navigator.clipboard?.writeText(newLink).then(() => setMessage(t("server.copied")))}>
                <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("server.copy")}
              </button>
            </div>
          </div>
        )}
        {invitations.length > 0 && (
          <ul className="mt-4 divide-y divide-edge">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-40 flex-1">
                  <span className="font-medium">{inv.label}</span>
                  <span className="block text-xs text-muted">
                    {stateLabel[inv.state]}
                    {inv.state === "open" ? ` · ${t("server.until", { date: when(inv.expires_at) })}` : ""}
                    {inv.family_name ? ` · ${inv.family_name}` : ""}
                    {inv.demo_active ? ` · ${t("server.demoActive")}` : ""}
                  </span>
                </span>
                {(inv.state === "open" || inv.state === "expired") && (
                  <>
                    <select
                      className="input w-auto py-1 text-xs"
                      value={extendDays[inv.id] ?? 7}
                      onChange={(e) => setExtendDays({ ...extendDays, [inv.id]: Number(e.target.value) })}
                      aria-label={t("server.lifetime")}
                    >
                      {LIFETIMES.map((d) => <option key={d} value={d}>{t("server.validDays", { n: d })}</option>)}
                    </select>
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => api.put(`/api/server/invitations/${inv.id}/extend`, { days: extendDays[inv.id] ?? 7 }))}>
                      {t("server.extend")}
                    </button>
                  </>
                )}
                {inv.state === "open" && (
                  <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-base" onClick={() => run(() => api.del(`/api/server/invitations/${inv.id}`))}>
                    {t("server.revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

        </>
      )}

      {tab === "data" && (
        <>
      <section className="card mt-4 p-5">
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
          <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("server.importTitle")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("server.importHint")}</p>
        <div className="flex flex-wrap gap-2">
          <input className="input min-w-48 flex-1 py-1.5" type="file" accept=".sfmove" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} aria-label={t("server.importFile")} />
          <input className="input min-w-40 flex-1" type="password" placeholder={t("server.passphrase")} value={importPass} onChange={(e) => setImportPass(e.target.value)} aria-label={t("server.passphrase")} />
          <button className="btn-primary" onClick={importFamily} disabled={!importFile || importPass.length < 10}>{t("server.import")}</button>
        </div>
      </section>

      <BackupKey scope="server" />
      <BackupsPanel />
      <DiskUsage />
      <FileLimit />
        </>
      )}

      {tab === "security" && (
        <>
          <ServerSecurity />
          <SecurityLog />
        </>
      )}

      {tab === "ai" && <ServerAiPanel />}

      {tab === "updates" && <ServerUpdates />}

      {tab === "devices" && (
        <div className="mt-4">
          <ServerDevices />
        </div>
      )}

      {tab === "reports" && (
        <div className="mt-4">
          <ServerReports />
        </div>
      )}

      {tab === "services" && (
        <div className="mt-4 space-y-4">
          <ServerAddress />
          <ServerServices />
        </div>
      )}

      {tab === "log" && (

      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("server.log")}</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted">{t("server.logEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {log.slice(0, 50).map((r) => (
              <li key={r.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-muted">{new Date(r.created_at).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1">
                  {t(`server.action.${r.action}` as Parameters<typeof t>[0])}
                  {r.detail ? ` – ${r.detail}` : ""}
                  {r.actor_name ? <span className="text-muted"> · {r.actor_name}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </>
  );
}
