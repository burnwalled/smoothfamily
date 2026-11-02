"use client";

// Flows (#44): the member's own automations in the Smart home app – When → If → Do, built from
// cards. Smooth Family runs them through the family's Home Assistant; a flow can only use devices
// its owner may control. Button flows can be starred for the Today card.
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Music, Pause, Play, Plus, Star, Trash2, Workflow, Zap } from "lucide-react";
import { api, Member, SmarthomeDeviceState } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { useMe } from "@/components/Shell";
import { useLive } from "@/lib/live";

type Trigger =
  | { type: "time"; at: string; days: number[] }
  | { type: "button" }
  | { type: "state"; device_id: string; to: string }
  | { type: "presence"; event: "arrive" | "leave" | "first_arrives" | "last_leaves"; user_id: string | null }
  | { type: "cheapest_hour"; hours: number };
type Condition =
  | { type: "time_between"; start: string; end: string }
  | { type: "weekdays"; days: number[] }
  | { type: "device_state"; device_id: string; state: string }
  | { type: "home"; who: "nobody" | "somebody" }
  | { type: "price_below"; ore: number }
  | { type: "cheapest_hours"; hours: number };
type Action =
  | { type: "device"; device_id: string; action: string; value: number | null }
  | { type: "media"; device_ids: string[]; media_content_id: string; media_content_type: string; title: string; volume: number | null }
  | { type: "notify"; to: "me" | "family"; text: string }
  | { type: "wait"; minutes: number };

export type Flow = {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  enabled: boolean;
  shared: boolean;
  approved: boolean;
  on_today: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  last_run_at: string | null;
  last_error: string | null;
  can_edit: boolean;
  run_in: "app" | "ha";
  ha_synced_at: string | null;
};

type Draft = Pick<Flow, "name" | "trigger" | "conditions" | "actions" | "shared" | "on_today" | "run_in"> & { id?: string };

// What only Smooth Family can do (the rest Home Assistant can run on its own).
const APP_ONLY = { triggers: ["button", "cheapest_hour"], conditions: ["price_below", "cheapest_hours"], actions: ["notify"] };

function needsApp(flow: Pick<Flow, "trigger" | "conditions" | "actions">): boolean {
  return APP_ONLY.triggers.includes(flow.trigger.type) || flow.conditions.some((c) => APP_ONLY.conditions.includes(c.type)) || flow.actions.some((a) => APP_ONLY.actions.includes(a.type));
}

type MediaItem = { title: string; media_content_id: string; media_content_type: string; can_play: boolean; can_expand: boolean };

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
// What a device of each kind can be told to do in a flow (with a value for the last ones).
const DEVICE_ACTIONS: Record<string, string[]> = {
  light: ["turn_on", "turn_off", "toggle", "brightness"],
  switch: ["turn_on", "turn_off", "toggle"],
  fan: ["turn_on", "turn_off", "percentage"],
  cover: ["open", "close", "position"],
  climate: ["turn_on", "turn_off", "set_temperature"],
  vacuum: ["start", "stop", "return_to_base"],
  scene: ["activate"],
  script: ["run"],
  automation: ["trigger", "turn_on", "turn_off"],
  media_player: ["play", "pause", "turn_off", "volume"],
};
const VALUE_ACTIONS = new Set(["brightness", "percentage", "position", "set_temperature", "volume"]);

function useWeekday() {
  const { dateLocale } = useI18n();
  // 2024-01-01 was a Monday.
  return (d: number) => new Date(2024, 0, 1 + d).toLocaleDateString(dateLocale, { weekday: "short" });
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const weekday = useWeekday();
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={days.includes(d)}
          className={`rounded-md border px-2 py-1 text-xs capitalize ${days.includes(d) ? "border-primary-700 bg-accent-soft font-semibold" : "border-edge text-muted"}`}
          onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}
        >
          {weekday(d)}
        </button>
      ))}
    </div>
  );
}

function MediaPicker({ speaker, onPick }: { speaker: string; onPick: (item: MediaItem) => void }) {
  const { t } = useI18n();
  const [path, setPath] = useState<MediaItem[]>([]);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setItems(null);
    setError("");
    const here = path[path.length - 1];
    const query = here ? `&content_id=${encodeURIComponent(here.media_content_id)}&content_type=${encodeURIComponent(here.media_content_type)}` : "";
    api
      .get<MediaItem[]>(`/api/smarthome/media/browse?device_id=${speaker}${query}`)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [speaker, path, t]);

  const [manual, setManual] = useState({ id: "", type: "music" });

  return (
    <div className="rounded-lg border border-edge p-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">
        <button type="button" className="hover:underline" onClick={() => setPath([])}>{t("flows.mediaLibrary")}</button>
        {path.map((p, i) => (
          <span key={`${p.media_content_id}-${i}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" aria-hidden />
            <button type="button" className="hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{p.title}</button>
          </span>
        ))}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!items && !error && <p className="text-xs text-muted">{t("common.loading")}</p>}
      <ul className="max-h-56 overflow-y-auto">
        {items?.map((item) => (
          <li key={`${item.media_content_type}:${item.media_content_id}`} className="flex items-center gap-2 py-0.5">
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.can_expand && (
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setPath([...path, item])}>{t("flows.open")}</button>
            )}
            {item.can_play && (
              <button type="button" className="btn-ghost border border-edge px-2 py-0.5 text-xs" onClick={() => onPick(item)}>{t("flows.choose")}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge pt-2">
        <input
          className="input min-w-40 flex-1 text-xs"
          value={manual.id}
          onChange={(e) => setManual({ ...manual, id: e.target.value })}
          placeholder="spotify:playlist:… / media-source://…"
          aria-label={t("flows.mediaId")}
        />
        <select className="input w-auto text-xs" value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })} aria-label={t("flows.mediaType")}>
          {["music", "playlist", "album", "url"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button
          type="button"
          className="btn-ghost border border-edge px-2 py-0.5 text-xs"
          disabled={!manual.id.trim()}
          onClick={() => onPick({ title: manual.id.trim(), media_content_id: manual.id.trim(), media_content_type: manual.type, can_play: true, can_expand: false })}
        >
          {t("flows.choose")}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">{t("flows.mediaIdHint")}</p>
    </div>
  );
}

function Editor({ draft, devices, members, haAvailable, onSaved, onCancel }: { draft: Draft; devices: SmarthomeDeviceState[]; members: Member[]; haAvailable: boolean; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const [flow, setFlow] = useState<Draft>(draft);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState("");
  const speakers = devices.filter((d) => d.domain === "media_player");
  const first = devices[0]?.id ?? "";
  const adult = me.role === "admin" || me.role === "adult";

  const setAction = (i: number, a: Action) => setFlow({ ...flow, actions: flow.actions.map((x, j) => (j === i ? a : x)) });
  const setCondition = (i: number, c: Condition) => setFlow({ ...flow, conditions: flow.conditions.map((x, j) => (j === i ? c : x)) });

  function newTrigger(type: Trigger["type"]): Trigger {
    if (type === "time") return { type, at: "07:00", days: [0, 1, 2, 3, 4] };
    if (type === "state") return { type, device_id: first, to: "on" };
    if (type === "presence") return { type, event: "arrive", user_id: null };
    if (type === "cheapest_hour") return { type, hours: 3 };
    return { type: "button" };
  }
  function newCondition(type: Condition["type"]): Condition {
    if (type === "time_between") return { type, start: "06:00", end: "22:00" };
    if (type === "weekdays") return { type, days: [0, 1, 2, 3, 4] };
    if (type === "device_state") return { type, device_id: first, state: "on" };
    if (type === "price_below") return { type, ore: 50 };
    if (type === "cheapest_hours") return { type, hours: 3 };
    return { type: "home", who: "nobody" };
  }
  function newAction(type: Action["type"]): Action {
    if (type === "media") return { type, device_ids: speakers[0] ? [speakers[0].id] : [], media_content_id: "", media_content_type: "", title: "", volume: 20 };
    if (type === "notify") return { type, to: "me", text: "" };
    if (type === "wait") return { type, minutes: 5 };
    const device = devices.find((d) => d.domain !== "media_player") ?? devices[0];
    return { type: "device", device_id: device?.id ?? "", action: DEVICE_ACTIONS[device?.domain ?? "light"]?.[0] ?? "turn_on", value: null };
  }

  async function save() {
    setError("");
    const body = { ...flow, name: flow.name.trim(), run_in: haAvailable && !needsApp(flow) ? flow.run_in : "app" };
    try {
      if (flow.id) await api.put(`/api/smarthome/flows/${flow.id}`, body);
      else await api.post("/api/smarthome/flows", body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const trigger = flow.trigger;
  return (
    <div className="card space-y-4 p-5" aria-label={t("flows.editor")}>
      <label className="block text-xs text-muted">
        {t("flows.name")}
        <input className="input mt-1 w-full" value={flow.name} maxLength={120} placeholder={t("flows.namePh")} onChange={(e) => setFlow({ ...flow, name: e.target.value })} />
      </label>

      <fieldset className="rounded-lg border border-edge p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("flows.when")}</legend>
        <select className="input w-full sm:w-auto" value={trigger.type} onChange={(e) => setFlow({ ...flow, trigger: newTrigger(e.target.value as Trigger["type"]), on_today: e.target.value === "button" && flow.on_today })} aria-label={t("flows.when")}>
          {(["time", "button", "state", "presence", "cheapest_hour"] as const).map((k) => <option key={k} value={k}>{t(`flows.trigger.${k}` as TranslationKey)}</option>)}
        </select>
        <div className="mt-2 space-y-2">
          {trigger.type === "time" && (
            <>
              <input type="time" className="input w-28" value={trigger.at} onChange={(e) => e.target.value && setFlow({ ...flow, trigger: { ...trigger, at: e.target.value } })} aria-label={t("flows.at")} />
              <DayPicker days={trigger.days} onChange={(days) => setFlow({ ...flow, trigger: { ...trigger, days } })} />
            </>
          )}
          {trigger.type === "button" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={flow.on_today} onChange={(e) => setFlow({ ...flow, on_today: e.target.checked })} />
              {t("flows.onToday")}
            </label>
          )}
          {trigger.type === "state" && (
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={trigger.device_id} onChange={(e) => setFlow({ ...flow, trigger: { ...trigger, device_id: e.target.value } })} aria-label={t("flows.device")}>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}
              </select>
              <input className="input w-32" value={trigger.to} maxLength={40} onChange={(e) => setFlow({ ...flow, trigger: { ...trigger, to: e.target.value } })} aria-label={t("flows.becomes")} placeholder="on" />
              <p className="w-full text-xs text-muted">{t("flows.stateHint")}</p>
            </div>
          )}
          {trigger.type === "presence" && (
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={trigger.event} onChange={(e) => setFlow({ ...flow, trigger: { ...trigger, event: e.target.value as typeof trigger.event } })} aria-label={t("flows.presenceEvent")}>
                {(["arrive", "leave", "first_arrives", "last_leaves"] as const).map((k) => <option key={k} value={k}>{t(`flows.presence.${k}` as TranslationKey)}</option>)}
              </select>
              {(trigger.event === "arrive" || trigger.event === "leave") && (
                <select className="input w-auto" value={trigger.user_id ?? ""} onChange={(e) => setFlow({ ...flow, trigger: { ...trigger, user_id: e.target.value || null } })} aria-label={t("flows.who")}>
                  <option value="">{t("flows.anyone")}</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
              )}
              <p className="w-full text-xs text-muted">{t("flows.presenceHint")}</p>
            </div>
          )}
          {trigger.type === "cheapest_hour" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select className="input w-auto" value={trigger.hours} onChange={(e) => setFlow({ ...flow, trigger: { ...trigger, hours: Number(e.target.value) } })} aria-label={t("flows.cheapestCount")}>
                {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{t("flows.cheapestN", { n })}</option>)}
              </select>
              <p className="w-full text-xs text-muted">{t("flows.electricityHint")}</p>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-edge p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("flows.if")}</legend>
        {flow.conditions.length === 0 && <p className="text-xs text-muted">{t("flows.always")}</p>}
        <ul className="space-y-2">
          {flow.conditions.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs font-semibold">{t(`flows.condition.${c.type}` as TranslationKey)}</span>
              {c.type === "time_between" && (
                <>
                  <input type="time" className="input w-28" value={c.start} onChange={(e) => e.target.value && setCondition(i, { ...c, start: e.target.value })} aria-label={t("flows.from")} />
                  –
                  <input type="time" className="input w-28" value={c.end} onChange={(e) => e.target.value && setCondition(i, { ...c, end: e.target.value })} aria-label={t("flows.to")} />
                </>
              )}
              {c.type === "weekdays" && <DayPicker days={c.days} onChange={(days) => setCondition(i, { ...c, days })} />}
              {c.type === "device_state" && (
                <>
                  <select className="input w-auto" value={c.device_id} onChange={(e) => setCondition(i, { ...c, device_id: e.target.value })} aria-label={t("flows.device")}>
                    {devices.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}
                  </select>
                  <input className="input w-28" value={c.state} maxLength={40} onChange={(e) => setCondition(i, { ...c, state: e.target.value })} aria-label={t("flows.isState")} />
                </>
              )}
              {c.type === "price_below" && (
                <label className="flex items-center gap-1">
                  <input type="number" min={0} max={1000} className="input w-24" value={c.ore} onChange={(e) => setCondition(i, { ...c, ore: Number(e.target.value) || 0 })} aria-label={t("flows.condition.price_below")} />
                  {t("electricity.unit")}
                </label>
              )}
              {c.type === "cheapest_hours" && (
                <select className="input w-auto" value={c.hours} onChange={(e) => setCondition(i, { ...c, hours: Number(e.target.value) })} aria-label={t("flows.cheapestCount")}>
                  {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{t("flows.cheapestN", { n })}</option>)}
                </select>
              )}
              {c.type === "home" && (
                <select className="input w-auto" value={c.who} onChange={(e) => setCondition(i, { ...c, who: e.target.value as "nobody" | "somebody" })} aria-label={t("flows.condition.home")}>
                  <option value="nobody">{t("flows.nobodyHome")}</option>
                  <option value="somebody">{t("flows.somebodyHome")}</option>
                </select>
              )}
              <button type="button" className="ml-auto text-muted hover:text-red-700" onClick={() => setFlow({ ...flow, conditions: flow.conditions.filter((_, j) => j !== i) })} aria-label={t("common.remove")}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <select className="input mt-2 w-auto text-xs" value="" onChange={(e) => e.target.value && setFlow({ ...flow, conditions: [...flow.conditions, newCondition(e.target.value as Condition["type"])] })} aria-label={t("flows.addCondition")}>
          <option value="">+ {t("flows.addCondition")}</option>
          {(["time_between", "weekdays", "device_state", "home", "price_below", "cheapest_hours"] as const).map((k) => <option key={k} value={k}>{t(`flows.condition.${k}` as TranslationKey)}</option>)}
        </select>
      </fieldset>

      <fieldset className="rounded-lg border border-edge p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("flows.do")}</legend>
        <ol className="space-y-3">
          {flow.actions.map((a, i) => (
            <li key={i} className="rounded-md bg-base/60 p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{i + 1}. {t(`flows.action.${a.type}` as TranslationKey)}</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => setFlow({ ...flow, actions: flow.actions.map((x, j) => (j === i - 1 ? a : j === i ? flow.actions[i - 1] : x)) })} aria-label={t("flows.up")}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" disabled={i === flow.actions.length - 1} className="text-muted disabled:opacity-30" onClick={() => setFlow({ ...flow, actions: flow.actions.map((x, j) => (j === i + 1 ? a : j === i ? flow.actions[i + 1] : x)) })} aria-label={t("flows.down")}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="text-muted hover:text-red-700" onClick={() => setFlow({ ...flow, actions: flow.actions.filter((_, j) => j !== i) })} aria-label={t("common.remove")}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {a.type === "device" && (() => {
                  const domain = devices.find((d) => d.id === a.device_id)?.domain ?? "light";
                  return (
                    <>
                      <select
                        className="input w-auto"
                        value={a.device_id}
                        onChange={(e) => {
                          const d = devices.find((x) => x.id === e.target.value);
                          setAction(i, { ...a, device_id: e.target.value, action: DEVICE_ACTIONS[d?.domain ?? "light"]?.[0] ?? "turn_on", value: null });
                        }}
                        aria-label={t("flows.device")}
                      >
                        {devices.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}
                      </select>
                      <select className="input w-auto" value={a.action} onChange={(e) => setAction(i, { ...a, action: e.target.value, value: VALUE_ACTIONS.has(e.target.value) ? a.value ?? 50 : null })} aria-label={t("flows.whatToDo")}>
                        {(DEVICE_ACTIONS[domain] ?? []).map((k) => <option key={k} value={k}>{t(`flows.do.${k}` as TranslationKey)}</option>)}
                      </select>
                      {VALUE_ACTIONS.has(a.action) && (
                        <input type="number" className="input w-20" value={a.value ?? ""} onChange={(e) => setAction(i, { ...a, value: e.target.value === "" ? null : Number(e.target.value) })} aria-label={t("flows.value")} />
                      )}
                    </>
                  );
                })()}
                {a.type === "media" && (
                  <div className="w-full space-y-2">
                    {speakers.length === 0 ? (
                      <p className="text-xs text-muted">{t("flows.noSpeakers")}</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {speakers.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={a.device_ids.includes(s.id)}
                              className={`rounded-full border px-2.5 py-1 text-xs ${a.device_ids.includes(s.id) ? "border-primary-700 bg-accent-soft font-semibold" : "border-edge"}`}
                              onClick={() => setAction(i, { ...a, device_ids: a.device_ids.includes(s.id) ? a.device_ids.filter((x) => x !== s.id) : [...a.device_ids, s.id] })}
                            >
                              {s.display_name}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Music className="h-4 w-4 text-accent" aria-hidden />
                          <span className={a.title ? "font-semibold" : "text-muted"}>{a.title || t("flows.noMedia")}</span>
                          {a.device_ids[0] && (
                            <button type="button" className="text-xs text-accent hover:underline" onClick={() => setPicking(picking === i ? null : i)}>{t("flows.pickMedia")}</button>
                          )}
                          <label className="ml-auto flex items-center gap-1 text-xs text-muted">
                            {t("flows.volume")}
                            <input type="number" min={0} max={100} className="input w-20" value={a.volume ?? ""} onChange={(e) => setAction(i, { ...a, volume: e.target.value === "" ? null : Number(e.target.value) })} />
                            %
                          </label>
                        </div>
                        {picking === i && a.device_ids[0] && (
                          <MediaPicker
                            speaker={a.device_ids[0]}
                            onPick={(item) => {
                              setAction(i, { ...a, media_content_id: item.media_content_id, media_content_type: item.media_content_type, title: item.title });
                              setPicking(null);
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
                {a.type === "notify" && (
                  <>
                    <select className="input w-auto" value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value as "me" | "family" })} aria-label={t("flows.notifyWho")}>
                      <option value="me">{t("flows.toMe")}</option>
                      <option value="family">{t("flows.toFamily")}</option>
                    </select>
                    <input className="input min-w-40 flex-1" value={a.text} maxLength={200} onChange={(e) => setAction(i, { ...a, text: e.target.value })} aria-label={t("flows.message")} placeholder={t("flows.messagePh")} />
                  </>
                )}
                {a.type === "wait" && (
                  <label className="flex items-center gap-2">
                    <input type="number" min={1} max={120} className="input w-20" value={a.minutes} onChange={(e) => setAction(i, { ...a, minutes: Number(e.target.value) || 1 })} aria-label={t("flows.minutes")} />
                    {t("flows.minutes")}
                  </label>
                )}
              </div>
            </li>
          ))}
        </ol>
        {flow.actions.length < 10 && (
          <select className="input mt-2 w-auto text-xs" value="" onChange={(e) => e.target.value && setFlow({ ...flow, actions: [...flow.actions, newAction(e.target.value as Action["type"])] })} aria-label={t("flows.addAction")}>
            <option value="">+ {t("flows.addAction")}</option>
            {(["device", "media", "notify", "wait"] as const).map((k) => <option key={k} value={k}>{t(`flows.action.${k}` as TranslationKey)}</option>)}
          </select>
        )}
      </fieldset>

      {adult && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={flow.shared} onChange={(e) => setFlow({ ...flow, shared: e.target.checked })} />
          {t("flows.share")}
        </label>
      )}
      {haAvailable && (
        <fieldset className="rounded-lg border border-edge p-3 text-sm">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">{t("flows.runIn")}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="run_in" checked={flow.run_in !== "ha" || needsApp(flow)} onChange={() => setFlow({ ...flow, run_in: "app" })} />
            {t("flows.runInApp")}
          </label>
          <label className={`mt-1 flex items-center gap-2 ${needsApp(flow) ? "text-muted" : ""}`}>
            <input type="radio" name="run_in" disabled={needsApp(flow)} checked={flow.run_in === "ha" && !needsApp(flow)} onChange={() => setFlow({ ...flow, run_in: "ha" })} />
            {t("flows.runInHa")}
          </label>
          <p className="mt-1 text-xs text-muted">{needsApp(flow) ? t("flows.runInHaNot") : t("flows.runInHaHint")}</p>
        </fieldset>
      )}
      {!adult && <p className="text-xs text-muted">{t("flows.childApproval")}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={save} disabled={!flow.name.trim() || flow.actions.length === 0}>{t("profile.save")}</button>
        <button className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

/** "Weekdays 07:00" / "When Anna comes home" … for the list. */
function useSummary(devices: SmarthomeDeviceState[], members: Member[]) {
  const { t } = useI18n();
  const weekday = useWeekday();
  const device = (id: string) => devices.find((d) => d.id === id)?.display_name ?? "?";
  const days = (d: number[]) => (d.length === 7 ? t("flows.everyDay") : d.join() === "0,1,2,3,4" ? t("flows.weekdays") : d.map(weekday).join(", "));
  return (flow: Flow) => {
    const tr = flow.trigger;
    const when =
      tr.type === "time" ? `${days(tr.days)} ${tr.at}`
      : tr.type === "button" ? t("flows.trigger.button")
      : tr.type === "state" ? t("flows.summary.state", { device: device(tr.device_id), state: tr.to })
      : tr.type === "cheapest_hour" ? t("flows.summary.cheapest", { n: tr.hours })
      : t(`flows.presence.${tr.event}` as TranslationKey) + (tr.user_id ? ` (${members.find((m) => m.id === tr.user_id)?.display_name ?? "?"})` : "");
    const does = flow.actions
      .map((a) =>
        a.type === "device" ? `${t(`flows.do.${a.action}` as TranslationKey)} ${device(a.device_id)}${a.value !== null ? ` ${a.value}` : ""}`
        : a.type === "media" ? t("flows.summary.media", { what: a.title || "?", where: a.device_ids.map(device).join(", ") })
        : a.type === "notify" ? t("flows.summary.notify", { text: a.text })
        : t("flows.summary.wait", { n: a.minutes })
      )
      .join(" → ");
    return { when, does };
  };
}

export default function Flows() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [devices, setDevices] = useState<SmarthomeDeviceState[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [haAvailable, setHaAvailable] = useState(false);
  const summary = useSummary(devices, members);

  const load = useCallback(() => {
    api.live<Flow[]>("/api/smarthome/flows", setFlows).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }, [t]);
  useEffect(load, [load]);
  useLive(["smarthome"], load);
  useEffect(() => {
    api.live<SmarthomeDeviceState[]>("/api/smarthome/my-devices", setDevices).catch(() => {});
    api.live<Member[]>("/api/family/members", setMembers).catch(() => {});
    api.get<{ available: boolean }>("/api/smarthome/flows/ha").then((r) => setHaAvailable(r.available)).catch(() => {});
  }, []);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  if (draft)
    return (
      <Editor
        draft={draft}
        devices={devices}
        members={members}
        haAvailable={haAvailable}
        onSaved={() => {
          setDraft(null);
          load();
        }}
        onCancel={() => setDraft(null)}
      />
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t("flows.intro")}</p>
        <button
          className="btn-primary flex items-center gap-1.5"
          disabled={devices.length === 0}
          onClick={() => setDraft({ name: "", trigger: { type: "time", at: "07:00", days: [0, 1, 2, 3, 4] }, conditions: [], actions: [], shared: false, on_today: false, run_in: "app" })}
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          {t("flows.new")}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {flows === null ? (
        <p className="text-sm text-muted">{t("common.loading")}</p>
      ) : flows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge p-4 text-sm text-muted">{t("flows.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {flows.map((flow) => {
            const { when, does } = summary(flow);
            const childFlow = flow.owner_id !== me.id && !flow.shared;
            return (
              <li key={flow.id} className={`card p-4 ${flow.enabled ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Workflow className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />
                  <span className="font-semibold">{flow.name}</span>
                  {flow.on_today && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label={t("flows.onToday")} />}
                  {flow.owner_id !== me.id && <span className="text-xs text-muted">· {flow.owner_name}</span>}
                  {!flow.approved && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("flows.waitingApproval")}</span>}
                  {flow.run_in === "ha" && <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-muted" title={t("flows.runInHaHint")}>{t("flows.inHa")}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {!flow.approved && adult && childFlow && (
                      <button className="btn-ghost border border-edge px-2 py-1 text-xs" onClick={() => run(() => api.post(`/api/smarthome/flows/${flow.id}/approve`, {}))}>{t("flows.approve")}</button>
                    )}
                    {flow.approved && flow.enabled && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => api.post(`/api/smarthome/flows/${flow.id}/run`, {}))} aria-label={t("flows.runNow", { name: flow.name })} title={t("flows.runNow", { name: flow.name })}>
                        <Zap className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    {(flow.can_edit || (adult && childFlow)) && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(() => api.put(`/api/smarthome/flows/${flow.id}/enabled`, { enabled: !flow.enabled }))} aria-label={flow.enabled ? t("flows.pause") : t("flows.resume")}>
                        {flow.enabled ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                      </button>
                    )}
                    {flow.can_edit && (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDraft({ id: flow.id, name: flow.name, trigger: flow.trigger, conditions: flow.conditions, actions: flow.actions, shared: flow.shared, on_today: flow.on_today, run_in: flow.run_in })}>
                        {t("flows.edit")}
                      </button>
                    )}
                    {(flow.can_edit || (adult && childFlow)) && (
                      <button className="btn-ghost px-2 py-1 text-red-700" onClick={() => window.confirm(t("flows.confirmDelete", { name: flow.name })) && run(() => api.del(`/api/smarthome/flows/${flow.id}`))} aria-label={t("common.remove")}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm"><span className="font-semibold">{when}</span>{flow.conditions.length > 0 && <span className="text-muted"> · {t("flows.withConditions", { n: flow.conditions.length })}</span>}</p>
                <p className="text-sm text-muted">→ {does}</p>
                {(flow.last_run_at || flow.last_error) && (
                  <p className={`mt-1 text-xs ${flow.last_error ? "text-red-700" : "text-muted"}`}>
                    {flow.last_run_at && t("flows.lastRun", { when: new Date(flow.last_run_at).toLocaleString(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) })}
                    {flow.last_error && ` · ${flow.last_error}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Starred button flows on the Today card's smart home widget. */
export function FlowButtons() {
  const { t } = useI18n();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [ran, setRan] = useState<string | null>(null);
  const load = useCallback(() => {
    api.live<Flow[]>("/api/smarthome/flows/today", setFlows).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLive(["smarthome"], load);
  if (flows.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {flows.map((flow) => (
        <button
          key={flow.id}
          className={`btn-ghost flex items-center gap-1.5 border border-edge px-3 py-1.5 text-sm ${ran === flow.id ? "border-green-600 text-green-700" : ""}`}
          onClick={async () => {
            await api.post(`/api/smarthome/flows/${flow.id}/run`, {}).catch(() => {});
            setRan(flow.id);
            window.setTimeout(() => setRan(null), 2000);
          }}
          aria-label={t("flows.runNow", { name: flow.name })}
        >
          <Zap className="h-4 w-4 text-accent" aria-hidden />
          {flow.name}
        </button>
      ))}
    </div>
  );
}
