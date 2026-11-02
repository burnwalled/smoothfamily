"use client";

// Family admin → Kitchen display: links for tablets on the wall, and everything about each screen in
// one place (3.0.4) – its name, the screensaver, what it shows, the night and what it may do. A screen
// shows the family's day and the shared flow buttons – nothing private – picks up a change within a
// minute, and can be given a new link or be disconnected here at any time. Its colours and the smart
// home devices it may switch are chosen here too.
import { useState } from "react";
import { Copy, Lightbulb, Link2, MonitorSmartphone, Moon, Palette, Pencil } from "lucide-react";
import { api, KIOSK_SCREENSAVERS, KIOSK_WIDGETS, KioskScreen } from "@/lib/api";
import { LOCALES, TranslationKey, useI18n } from "@/lib/i18n";
import { NONE, setApiData, useApi } from "@/lib/query";
import SaverPreview from "@/components/kiosk/SaverPreview";
import { THEMES } from "@/lib/theme";
import { domainIcon } from "@/lib/smarthome";

type Change = Partial<Pick<KioskScreen, "name" | "pantry_scan" | "easy_mode" | "widgets" | "screensaver" | "idle_minutes" | "night_dim" | "night_from" | "night_to" | "language" | "theme" | "devices">>;
const MINUTES = [1, 3, 5, 10, 15, 30, 60];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// A screen on the wall never opens a lock (the server keeps to the same).
const KIOSK_DOMAINS = ["light", "switch", "fan", "cover", "climate", "scene", "script", "media_player", "vacuum"];
type FamilyDevice = { id: string; display_name: string; domain: string };

export default function KioskSettingsPage() {
  const { t, dateLocale } = useI18n();
  // From the cache; a change shows at once and is saved behind.
  const screens = useApi<KioskScreen[]>("/api/kiosks").data ?? NONE;
  const setScreens = (update: (all: KioskScreen[]) => KioskScreen[]) => setApiData<KioskScreen[]>("/api/kiosks", (all) => update(all ?? NONE));
  const [name, setName] = useState("");
  const [pantryScan, setPantryScan] = useState(false);
  const [easyMode, setEasyMode] = useState(false);
  const [created, setCreated] = useState<KioskScreen | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // The family's smart home devices; null without a Home Assistant (the group isn't shown).
  const devicesQuery = useApi<FamilyDevice[]>("/api/smarthome/devices");
  const familyDevices = devicesQuery.data ? devicesQuery.data.filter((d) => KIOSK_DOMAINS.includes(d.domain)) : null;

  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

  async function create() {
    setError("");
    try {
      setCreated(await api.post<KioskScreen>("/api/kiosks", { name: name.trim(), pantry_scan: pantryScan, easy_mode: easyMode }));
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  // Shown at once, saved behind; on an error the list is read again.
  async function change(screen: KioskScreen, patch: Change) {
    setScreens((all) => all.map((s) => (s.id === screen.id ? { ...s, ...patch } : s)));
    setApplied(null);
    try {
      await api.put(`/api/kiosks/${screen.id}`, patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function newLink(screen: KioskScreen) {
    if (!window.confirm(t("kiosk.newLinkConfirm", { name: screen.name }))) return;
    setCreated(await api.post<KioskScreen>(`/api/kiosks/${screen.id}/link`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function applyToAll(from: KioskScreen) {
    const { pantry_scan, easy_mode, widgets, screensaver, idle_minutes, night_dim, night_from, night_to, language, theme, devices } = from;
    const same: Change = { pantry_scan, easy_mode, widgets, screensaver, idle_minutes, night_dim, night_from, night_to, language, theme, devices };
    await Promise.all(screens.filter((s) => s.id !== from.id && !s.revoked_at).map((s) => api.put(`/api/kiosks/${s.id}`, same)));
    setApplied(from.id);
  }

  const active = screens.filter((s) => !s.revoked_at);
  const gone = screens.filter((s) => s.revoked_at);

  return (
    <div className="space-y-4">
      <section className="card p-5" aria-labelledby="kiosk-new">
        <h2 id="kiosk-new" className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
          <MonitorSmartphone className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("kiosk.title")}
        </h2>
        <p className="mb-3 text-xs text-muted">{t("kiosk.help")}</p>

        {created?.url && (
          <div className="mb-4 rounded-lg border border-accent/40 bg-accent-soft p-3">
            <p className="text-sm font-semibold">{t("kiosk.created", { name: created.name })}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={created.url} aria-label={t("kiosk.link")} onFocus={(e) => e.target.select()} />
              <button className="btn-ghost flex items-center gap-1 border border-edge" onClick={() => navigator.clipboard?.writeText(created.url ?? "")}>
                <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                {t("guests.copy")}
              </button>
            </div>
            {created.qr_svg && (
              // SVG generated by our own backend (qrcode library), not user content.
              <div className="mt-3 h-40 w-40 rounded bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: created.qr_svg }} />
            )}
            <p className="mt-2 text-xs text-muted">{t("kiosk.onlyOnce")}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <input className="input min-w-40 flex-1" value={name} maxLength={80} placeholder={t("kiosk.namePh")} onChange={(e) => setName(e.target.value)} aria-label={t("kiosk.name")} />
          <button className="btn-primary" disabled={!name.trim()} onClick={create}>{t("kiosk.create")}</button>
        </div>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={pantryScan} onChange={(e) => setPantryScan(e.target.checked)} />
          <span>
            {t("kiosk.pantryScan")}
            <span className="block text-xs text-muted">{t("kiosk.pantryScanHelp")}</span>
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={easyMode} onChange={(e) => setEasyMode(e.target.checked)} />
          <span>
            {t("kiosk.easyMode")}
            <span className="block text-xs text-muted">{t("kiosk.easyModeHelp")}</span>
          </span>
        </label>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>

      {screens.length > 0 && (
        <ul className="space-y-4">
          {active.map((s) => (
            <li key={s.id} className="card divide-y divide-edge p-0">
              {/* Name, when it was last seen, a new link, disconnect */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                {renaming === s.id ? (
                  <input
                    autoFocus
                    className="input min-w-0 max-w-xs flex-1 font-semibold"
                    defaultValue={s.name}
                    maxLength={80}
                    aria-label={t("kiosk.rename", { name: s.name })}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      setRenaming(null);
                      if (next && next !== s.name) change(s, { name: next });
                    }}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
                  />
                ) : (
                  <h3 className="flex items-center gap-1.5 text-base font-bold text-ink">
                    {s.name}
                    <button className="btn-ghost p-1" onClick={() => setRenaming(s.id)} aria-label={t("kiosk.rename", { name: s.name })}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </h3>
                )}
                <span className="text-xs text-muted">{s.last_seen_at ? t("kiosk.lastSeen", { when: when(s.last_seen_at) }) : t("kiosk.notOpened")}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  {t("kiosk.language")}
                  <select className="input w-auto py-1 text-xs" value={s.language} onChange={(e) => change(s, { language: e.target.value })}>
                    <option value="">{t("kiosk.languageFamily")}</option>
                    {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </label>
                <span className="ml-auto flex flex-wrap gap-2">
                  <button className="btn-ghost flex items-center gap-1 border border-edge px-2 py-1 text-xs" onClick={() => newLink(s)}>
                    <Link2 className="h-3.5 w-3.5" aria-hidden />
                    {t("kiosk.newLink")}
                  </button>
                  <button className="px-2 text-xs text-red-700 hover:underline" onClick={() => api.del(`/api/kiosks/${s.id}`)}>
                    {t("kiosk.disconnect")}
                  </button>
                </span>
              </div>

              {/* The screensaver: a picture of each, and when it comes on */}
              <div className="p-4" role="group" aria-label={t("kiosk.saver.title")}>
                <h4 className="mb-2 text-sm font-semibold">{t("kiosk.saver.title")}</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {KIOSK_SCREENSAVERS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      aria-pressed={s.screensaver === x}
                      className={`rounded-xl border-2 p-1 text-left transition ${s.screensaver === x ? "border-accent bg-accent-soft" : "border-transparent hover:border-edge"}`}
                      onClick={() => change(s, { screensaver: x })}
                    >
                      <SaverPreview kind={x} />
                      <span className="mt-1 block px-1 text-xs font-semibold">{t(`kiosk.saver.${x}` as TranslationKey)}</span>
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <span className="whitespace-nowrap">{t("kiosk.saver.startsAfter")}</span>
                  <select className="input !w-auto py-1 text-sm" value={s.idle_minutes} onChange={(e) => change(s, { idle_minutes: Number(e.target.value) })}>
                    {MINUTES.map((m) => <option key={m} value={m}>{t("kiosk.saver.minutes", { n: m })}</option>)}
                  </select>
                </label>
              </div>

              {/* What it shows */}
              <div className="p-4" role="group" aria-label={t("kiosk.widgets")}>
                <h4 className="mb-2 text-sm font-semibold">{t("kiosk.widgets")}</h4>
                <div className="flex flex-wrap gap-2">
                  {KIOSK_WIDGETS.map((w) => {
                    const on = s.widgets.includes(w);
                    return (
                      <label key={w} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted"}`}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-primary-700" checked={on} onChange={(e) => change(s, { widgets: e.target.checked ? KIOSK_WIDGETS.filter((x) => x === w || s.widgets.includes(x)) : s.widgets.filter((x) => x !== w) })} />
                        {t(`kiosk.widget.${w}` as TranslationKey)}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Its colours */}
              <div className="p-4" role="group" aria-label={t("kiosk.theme")}>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Palette className="h-4 w-4" aria-hidden />
                  {t("kiosk.theme")}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map((th) => {
                    const on = (s.theme || "forest") === th.id;
                    return (
                      <button
                        key={th.id}
                        type="button"
                        aria-pressed={on}
                        className={`flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-xs font-semibold ${on ? "border-accent bg-accent-soft" : "border-edge"}`}
                        onClick={() => change(s, { theme: th.id })}
                      >
                        <span className="flex h-6 w-6 overflow-hidden rounded-full ring-1 ring-black/10" aria-hidden>
                          {th.swatch.map((c) => <span key={c} className="h-full flex-1" style={{ background: c }} />)}
                        </span>
                        {t(`theme.${th.id}` as TranslationKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The smart home devices it may switch */}
              {familyDevices && (
                <div className="p-4" role="group" aria-label={t("kiosk.devicesPick")}>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Lightbulb className="h-4 w-4" aria-hidden />
                    {t("kiosk.devicesPick")}
                  </h4>
                  <p className="mb-2 text-xs text-muted">{familyDevices.length ? t("kiosk.devicesHelp") : t("kiosk.devicesNone")}</p>
                  <div className="flex flex-wrap gap-2">
                    {familyDevices.map((d) => {
                      const on = s.devices.includes(d.id);
                      const Icon = domainIcon(d.domain);
                      return (
                        <label key={d.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted"}`}>
                          <input type="checkbox" className="h-3.5 w-3.5 accent-primary-700" checked={on} onChange={(e) => change(s, { devices: e.target.checked ? [...s.devices, d.id] : s.devices.filter((x) => x !== d.id) })} />
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {d.display_name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* The night */}
              <div className="p-4" role="group" aria-label={t("kiosk.night.title")}>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Moon className="h-4 w-4" aria-hidden />
                  {t("kiosk.night.title")}
                </h4>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={s.night_dim} onChange={(e) => change(s, { night_dim: e.target.checked })} />
                  <span>
                    {t("kiosk.night.dim")}
                    <span className="block text-xs text-muted">{t("kiosk.night.help")}</span>
                  </span>
                </label>
                {s.night_dim && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-sm">
                    <label className="flex items-center gap-1.5">
                      {t("kiosk.night.from")}
                      <select className="input w-auto py-1 text-sm" value={s.night_from} onChange={(e) => change(s, { night_from: Number(e.target.value) })}>
                        {HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      {t("kiosk.night.to")}
                      <select className="input w-auto py-1 text-sm" value={s.night_to} onChange={(e) => change(s, { night_to: Number(e.target.value) })}>
                        {HOURS.map((h) => <option key={h} value={h}>{hour(h)}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {/* What it may do */}
              <div className="space-y-2 p-4" role="group" aria-label={t("kiosk.features")}>
                <h4 className="text-sm font-semibold">{t("kiosk.features")}</h4>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={s.pantry_scan} onChange={(e) => change(s, { pantry_scan: e.target.checked })} />
                  <span>
                    {t("kiosk.pantryScan")}
                    <span className="block text-xs text-muted">{t("kiosk.pantryScanHelp")}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={s.easy_mode} onChange={(e) => change(s, { easy_mode: e.target.checked })} />
                  <span>
                    {t("kiosk.easyMode")}
                    <span className="block text-xs text-muted">{t("kiosk.easyModeHelp")}</span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-muted">
                <span>{t("kiosk.reachesScreen")}</span>
                {active.length > 1 && (
                  <button className="btn-ghost ml-auto border border-edge px-2 py-1 text-xs" onClick={() => applyToAll(s)}>
                    {applied === s.id ? t("kiosk.applied") : t("kiosk.applyAll")}
                  </button>
                )}
              </div>
            </li>
          ))}
          {gone.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-1 text-sm text-muted">
              <span className="font-semibold">{s.name}</span>
              <span className="text-xs">{t("kiosk.disconnected")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
