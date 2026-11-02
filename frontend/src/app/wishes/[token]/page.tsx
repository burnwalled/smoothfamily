"use client";

// A wish list shared with relatives outside the app: see the wishes and reserve one with your
// name. The person the list is for never sees who is buying what. The key to undo your own
// reservation stays in this browser.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type GuestList = {
  name: string;
  family_name: string;
  wishes: { id: string; title: string; url: string | null; note: string | null; reserved: boolean; reserved_by_you: boolean }[];
};

const KEYS = "sf.wish-keys";

function keys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? "{}");
  } catch {
    return {};
  }
}

export default function SharedWishList() {
  const { token } = useParams<{ token: string }>();
  const { t } = useI18n();
  const [list, setList] = useState<GuestList | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [guest, setGuest] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<GuestList>(`/api/wishes/${token}`)
      .then((l) => {
        // The keys this browser holds tell which reservations are yours.
        const mine = keys();
        setList({ ...l, wishes: l.wishes.map((w) => ({ ...w, reserved_by_you: w.reserved && !!mine[`${token}:${w.id}`] })) });
      })
      .catch(() => setInvalid(true));
  }, [token]);
  useEffect(() => {
    load();
    try {
      setGuest(localStorage.getItem("sf.guest-name") ?? "");
    } catch {}
  }, [load]);

  async function reserve(id: string) {
    setError("");
    try {
      const { key } = await api.post<{ key: string }>(`/api/wishes/${token}/${id}/reserve`, { name: guest.trim() });
      const all = keys();
      all[`${token}:${id}`] = key;
      localStorage.setItem(KEYS, JSON.stringify(all));
      localStorage.setItem("sf.guest-name", guest.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
    load();
  }

  async function undo(id: string) {
    const key = keys()[`${token}:${id}`];
    if (!key) return;
    await api.del(`/api/wishes/${token}/${id}/reserve?key=${encodeURIComponent(key)}`).catch(() => {});
    const all = keys();
    delete all[`${token}:${id}`];
    localStorage.setItem(KEYS, JSON.stringify(all));
    load();
  }

  return (
    <div className="min-h-screen bg-primary-900 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-center text-primary-100">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Smooth Family</h1>
        </div>
        {invalid ? (
          <div className="card p-6 text-center">
            <h2 className="text-lg font-bold">{t("invite.invalidTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("share.invalidText")}</p>
          </div>
        ) : !list ? (
          <p className="text-center text-sm text-primary-100">{t("common.loading")}</p>
        ) : (
          <div className="card p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Gift className="h-5 w-5 text-accent" strokeWidth={2} aria-hidden />
              {t("share.title", { name: list.name })}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("share.intro", { family: list.family_name, name: list.name })}</p>
            <label className="label mt-4" htmlFor="guest-name">{t("share.yourName")}</label>
            <input id="guest-name" className="input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder={t("share.yourNamePh")} />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            {list.wishes.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t("birthdays.noWishes")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {list.wishes.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm">
                    <span className={`min-w-0 flex-1 ${w.reserved && !w.reserved_by_you ? "text-muted line-through" : ""}`}>
                      {w.title}
                      {w.url && (
                        <a href={w.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 inline-flex align-[-2px] text-accent" aria-label={t("birthdays.openLink")}>
                          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                        </a>
                      )}
                      {w.note && <span className="block text-xs text-muted">{w.note}</span>}
                    </span>
                    {w.reserved_by_you ? (
                      <button className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold" onClick={() => undo(w.id)}>
                        {t("birthdays.youAreBuying")} · {t("birthdays.undo")}
                      </button>
                    ) : w.reserved ? (
                      <span className="text-xs text-muted">{t("share.taken")}</span>
                    ) : (
                      <button className="btn-ghost border border-edge px-2.5 py-1 text-xs" onClick={() => reserve(w.id)} disabled={!guest.trim()}>
                        {t("birthdays.illBuy")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">{t("share.footer")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
