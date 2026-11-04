"use client";

// The vault's password manager (2.8.1): the family's accounts, encrypted with the family's key on
// the server. An adult's logins are theirs unless they share one with chosen adults (who may see and
// copy it, not change it); a child's are seen by the adults, and a child sees only their own. The
// password is fetched only when shown or copied, never cached, and the clipboard is cleared again.
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Link2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { api, Member, VaultLogin } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import { EmptyState } from "@/components/PageTitle";
import ShareDialog from "@/components/vault/ShareDialog";

export const CLEAR_AFTER_MS = 30_000;
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%&*+-=?@_";

/** A random password from the browser's secure random numbers (no bias: rejection sampling). */
export function generatePassword(length = 20): string {
  const out: string[] = [];
  const limit = 256 - (256 % CHARS.length);
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(CHARS[b % CHARS.length]);
    }
  }
  return out.join("");
}

export async function fetchSecret(id: string): Promise<{ password: string; notes: string }> {
  // A plain fetch: never in the app's cache, and the server says no-store.
  const resp = await fetch(`/api/vault/logins/${id}/secret`, { credentials: "same-origin", cache: "no-store" });
  if (!resp.ok) throw new Error("secret");
  return resp.json();
}

type Form = { id?: string; owner_id: string; title: string; url: string; username: string; password: string; notes: string; keepSecret: boolean; shared_with: string[] };

export default function Passwords({ query }: { query: string }) {
  const { t } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  // From the cache (kept in memory only – the vault is never saved in the browser).
  const loginsQuery = useApi<VaultLogin[]>("/api/vault/logins");
  const logins = loginsQuery.data ?? (loginsQuery.isError ? NONE : null);
  const members = useApi<Member[]>(adult ? "/api/family/members" : null).data ?? NONE;
  const [shown, setShown] = useState<Record<string, { password: string; notes: string }>>({});
  const [form, setForm] = useState<Form | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState<VaultLogin | null>(null);

  // Nothing revealed stays on screen when leaving the page.
  useEffect(() => () => setShown({}), []);

  const children = members.filter((m) => m.role === "child");
  // Those an adult can share with: the other adults.
  const adults = members.filter((m) => m.role !== "child" && m.id !== me.id);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (logins ?? []).filter((l) => !needle || [l.title, l.url, l.username].some((v) => v.toLowerCase().includes(needle)));
    const byOwner = new Map<string, VaultLogin[]>();
    for (const row of rows) byOwner.set(row.owner_id, [...(byOwner.get(row.owner_id) ?? []), row]);
    // Mine first, then each child's.
    return [...byOwner.entries()].sort(([a], [b]) => (a === me.id ? -1 : b === me.id ? 1 : 0));
  }, [logins, query, me.id]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t("vault.copied", { what }));
      // Clear it again – if it still holds what we put there (reading may not be allowed).
      setTimeout(async () => {
        try {
          if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText("");
        } catch {}
      }, CLEAR_AFTER_MS);
    } catch {
      setNotice(t("common.error"));
    }
  }

  async function copyPassword(row: VaultLogin) {
    try {
      await copy((await fetchSecret(row.id)).password, t("vault.password"));
    } catch {
      setNotice(t("common.error"));
    }
  }

  async function toggle(row: VaultLogin) {
    if (shown[row.id]) {
      setShown(({ [row.id]: _, ...rest }) => rest);
      return;
    }
    try {
      const secret = await fetchSecret(row.id);
      setShown((s) => ({ ...s, [row.id]: secret }));
    } catch {
      setNotice(t("common.error"));
    }
  }

  function edit(row?: VaultLogin) {
    setError("");
    setShowNew(false);
    setForm(
      row
        ? { id: row.id, owner_id: row.owner_id, title: row.title, url: row.url, username: row.username, password: "", notes: "", keepSecret: true, shared_with: row.shared_with }
        : { owner_id: me.id, title: "", url: "", username: "", password: generatePassword(), notes: "", keepSecret: false, shared_with: [] },
    );
  }

  async function save() {
    if (!form || !form.title.trim()) return;
    const body = {
      owner_id: form.owner_id === me.id ? null : form.owner_id,
      title: form.title,
      url: form.url,
      username: form.username,
      // When editing, an untouched password and note are kept as they are.
      password: form.keepSecret && !form.password ? null : form.password,
      notes: form.keepSecret && !form.notes ? null : form.notes,
      // Only my own logins are shared; a child's are already seen by the adults.
      shared_with: form.owner_id === me.id ? form.shared_with : [],
    };
    try {
      if (form.id) await api.put(`/api/vault/logins/${form.id}`, body);
      else await api.post("/api/vault/logins", body);
      setForm(null);
      setShown({});
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function remove(row: VaultLogin) {
    if (!confirm(t("vault.confirmDeleteLogin", { name: row.title }))) return;
    await api.del(`/api/vault/logins/${row.id}`).catch(() => {});
  }

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? logins?.find((l) => l.owner_id === id)?.owner_name ?? "";
  const ownerName = (id: string) => {
    if (id === me.id) return t("vault.mine");
    // Another adult's: shared with me.
    return children.some((c) => c.id === id) ? nameOf(id) : t("vault.sharedBy", { name: nameOf(id) });
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        {adult ? t("vault.loginsIntroAdult") : t("vault.loginsIntroChild")}
      </p>

      {!form && (
        <button className="btn btn-primary" onClick={() => edit()}>
          {t("vault.addLogin")}
        </button>
      )}

      {form && (
        <section className="card space-y-3 p-4" aria-label={form.id ? t("vault.editLogin") : t("vault.addLogin")}>
          {adult && children.length > 0 && (
            <label className="block text-sm">
              {t("vault.whose")}
              <select className="input mt-1" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value={me.id}>{t("vault.mine")}</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            {t("vault.loginTitle")}
            <input className="input mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("vault.loginTitlePh")} />
          </label>
          <label className="block text-sm">
            {t("vault.url")}
            <input className="input mt-1" type="url" inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
          </label>
          <label className="block text-sm">
            {t("vault.username")}
            <input className="input mt-1" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <div className="text-sm">
            <label htmlFor="vault-password">{t("vault.password")}</label>
            <div className="mt-1 flex gap-2">
              <input
                id="vault-password"
                className="input flex-1 font-mono"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                placeholder={form.keepSecret ? t("vault.keepPassword") : ""}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button type="button" className="btn" onClick={() => setShowNew((v) => !v)} aria-label={showNew ? t("vault.hide") : t("vault.show")}>
                {showNew ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
              <button type="button" className="btn" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowNew(true); }} aria-label={t("vault.generate")} title={t("vault.generate")}>
                <RefreshCw className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          {adult && form.owner_id === me.id && adults.length > 0 && (
            <fieldset className="text-sm">
              <legend>{t("vault.shareWith")}</legend>
              <p className="text-xs text-muted">{t("vault.shareHelp")}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {adults.map((a) => (
                  <label key={a.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary-700"
                      checked={form.shared_with.includes(a.id)}
                      onChange={(e) =>
                        setForm({ ...form, shared_with: e.target.checked ? [...form.shared_with, a.id] : form.shared_with.filter((x) => x !== a.id) })
                      }
                    />
                    {a.display_name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block text-sm">
            {t("vault.notes")}
            <textarea className="input mt-1" rows={2} value={form.notes} placeholder={form.keepSecret ? t("vault.keepNotes") : ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={save} disabled={!form.title.trim()}>
              {t("vault.save")}
            </button>
            <button className="btn" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </section>
      )}

      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}

      {logins === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : groups.length === 0 ? (
        <EmptyState>{query ? t("vault.noMatches") : t("vault.noLogins")}</EmptyState>
      ) : (
        groups.map(([owner, rows]) => (
          <section key={owner} aria-label={ownerName(owner)}>
            {(groups.length > 1 || owner !== me.id) && <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{ownerName(owner)}</h2>}
            <ul className="card divide-y divide-edge">
              {rows.map((row) => (
                <li key={row.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{row.title}</p>
                      {row.url && (
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-accent hover:underline">
                          {row.url.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {row.username && <p className="truncate text-sm text-muted">{row.username}</p>}
                      {row.owner_id === me.id && row.shared_with.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">{t("vault.sharedWith", { names: row.shared_with.map(nameOf).filter(Boolean).join(", ") })}</p>
                      )}
                      {row.has_password && (
                        <p className="mt-1 font-mono text-sm" aria-live="polite">
                          {shown[row.id] ? shown[row.id].password : "••••••••••"}
                        </p>
                      )}
                      {shown[row.id]?.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{shown[row.id].notes}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {row.username && (
                        <button className="btn px-2" onClick={() => copy(row.username, t("vault.username"))} aria-label={t("vault.copyUsername", { name: row.title })} title={t("vault.copyUsername", { name: row.title })}>
                          <Copy className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {row.has_password && (
                        <button className="btn px-2" onClick={() => copyPassword(row)} aria-label={t("vault.copyPassword", { name: row.title })} title={t("vault.copyPassword", { name: row.title })}>
                          <KeyRound className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {(row.has_password || row.has_notes) && (
                        <button className="btn px-2" onClick={() => toggle(row)} aria-label={shown[row.id] ? t("vault.hide") : t("vault.showLogin", { name: row.title })}>
                          {shown[row.id] ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                        </button>
                      )}
                      {row.can_edit && adult && (
                        <button className="btn px-2" onClick={() => setSharing(row)} aria-label={t("vault.shareTitle", { name: row.title })} title={t("vault.shareOnce")}>
                          <Link2 className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                      {row.can_edit && (
                        <>
                          <button className="btn px-2" onClick={() => edit(row)} aria-label={t("vault.editLogin")}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button className="btn px-2 text-red-600" onClick={() => remove(row)} aria-label={t("common.remove")}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {sharing && <ShareDialog kind="login" targetId={sharing.id} title={sharing.title} onClose={() => setSharing(null)} />}
    </div>
  );
}
