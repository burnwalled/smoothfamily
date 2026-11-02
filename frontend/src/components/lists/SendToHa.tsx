"use client";

// A list linked to one of Home Assistant's to-do lists, both ways (2.8.4, not fully tested yet).
// Home Assistant passes it on to the shop's app through the shop's own integration (ICA, Coop …);
// Smooth Family never signs in to a shop. A one-off send is still there for a list not linked.
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Link2, RefreshCw, Send, Unlink, X } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Target = { connection_id: string; home: string | null; entity_id: string; name: string };
type Link = { connection_id: string; entity_id: string; name: string; home: string | null; last_sync: string | null; last_error: string | null };

const LAST = "sf:ha-list-target";
const key = (x: { connection_id: string; entity_id: string }) => `${x.connection_id}|${x.entity_id}`;

export default function SendToHa({ listId, onClose, onSynced }: { listId: string; onClose: () => void; onSynced?: () => void }) {
  const { t, dateLocale } = useI18n();
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    api.get<Link | null>(`/api/lists/${listId}/ha`).then(setLink).catch(() => setLink(null));
  }, [listId]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get<Target[]>("/api/lists/ha/targets").then((rows) => {
      setTargets(rows);
      let last = "";
      try {
        last = localStorage.getItem(LAST) ?? "";
      } catch {
        /* private mode */
      }
      setChosen(rows.some((r) => key(r) === last) ? last : rows[0] ? key(rows[0]) : "");
    }).catch(() => setTargets([]));
  }, []);

  const target = targets?.find((x) => key(x) === chosen);
  const nameOf = (l: Link) => targets?.find((x) => key(x) === key(l))?.name ?? l.entity_id;

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await action());
      try {
        localStorage.setItem(LAST, chosen);
      } catch {
        /* private mode */
      }
      load();
      onSynced?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const linkTo = () => run(async () => {
    await api.put(`/api/lists/${listId}/ha`, { connection_id: target!.connection_id, entity_id: target!.entity_id });
    return t("lists.haLinked", { name: target!.name });
  });
  const sendOnce = () => run(async () => {
    const r = await api.post<{ sent: number }>(`/api/lists/${listId}/to-ha`, { connection_id: target!.connection_id, entity_id: target!.entity_id, open_only: openOnly });
    return t("lists.toHaSent", { n: r.sent, name: target!.name });
  });
  const syncNow = () => run(async () => {
    await api.post(`/api/lists/${listId}/ha/sync`, {});
    return t("lists.haSynced");
  });
  const unlink = () => run(async () => {
    await api.del(`/api/lists/${listId}/ha`);
    return t("lists.haUnlinked");
  });

  return (
    <div className="mt-2 w-full rounded-lg border border-edge p-3 text-sm" role="region" aria-label={t("lists.toHa")}>
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs text-muted">{t("lists.toHaHint")}</p>
        <button className="text-muted hover:text-ink" onClick={onClose} aria-label={t("common.close")}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 rounded bg-amber-50 p-2 text-xs text-amber-900">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("lists.haBeta")}
      </p>

      {link === undefined || targets === null ? (
        <p className="mt-2 text-muted">{t("common.loading")}</p>
      ) : link ? (
        <div className="mt-2 space-y-2">
          <p>
            <Link2 className="mr-1 inline h-4 w-4 text-green-700" aria-hidden />
            {t("lists.haLinkedTo", { name: link.home ? `${link.home} · ${nameOf(link)}` : nameOf(link) })}
            {link.last_sync && <span className="text-xs text-muted"> · {t("lists.haLastSync", { when: new Date(link.last_sync).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }) })}</span>}
          </p>
          {link.last_error && <p className="text-xs text-red-700">{t("lists.haError", { error: link.last_error })}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-edge" disabled={busy} onClick={syncNow}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
              {t("lists.haSyncNow")}
            </button>
            <button className="btn-ghost text-red-700" disabled={busy} onClick={unlink}>
              <Unlink className="h-4 w-4" aria-hidden />
              {t("lists.haUnlink")}
            </button>
          </div>
        </div>
      ) : targets.length === 0 ? (
        <p className="mt-2">{t("lists.toHaNone")}</p>
      ) : (
        <div className="mt-2 space-y-2">
          <select className="input w-auto" value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label={t("lists.toHaTarget")}>
            {targets.map((x) => (
              <option key={key(x)} value={key(x)}>
                {x.home ? `${x.home} · ${x.name}` : x.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">{t("lists.haCreateInShop")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={busy || !target} onClick={linkTo}>
              <Link2 className="h-4 w-4" aria-hidden />
              {t("lists.haLink")}
            </button>
            <span className="text-xs text-muted">{t("lists.haOr")}</span>
            <button className="btn-ghost border border-edge" disabled={busy || !target} onClick={sendOnce}>
              <Send className="h-4 w-4" aria-hidden />
              {t("lists.toHaSend")}
            </button>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              {t("lists.toHaOpenOnly")}
            </label>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        {t("lists.toHaShops")}{" "}
        <a className="text-accent hover:underline" href="https://github.com/jochke/ica_shopping_list" target="_blank" rel="noreferrer noopener">ICA</a>
        {" · "}
        <a className="text-accent hover:underline" href="https://github.com/Esspel/ha_coop_sverige" target="_blank" rel="noreferrer noopener">Coop</a>
      </p>
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    </div>
  );
}
