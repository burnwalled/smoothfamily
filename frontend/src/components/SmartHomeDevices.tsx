"use client";

// Admin picker for Home Assistant entities: search + filter the (often very
// long) HA entity list, give each device a family-friendly name, choose who
// may control it, and rename/remove devices that are already exposed.
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, Member, SmarthomeDevice, SmarthomeEntity } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { refreshApi, useApi } from "@/lib/query";
import { HomeConn } from "@/components/smarthome/Homes";
import { domainIcon, isActive, SMART_DOMAINS, SmartDomain } from "@/lib/smarthome";

function DomainIcon({ domain, className = "" }: { domain: string; className?: string }) {
  const Icon = domainIcon(domain);
  return <Icon className={`h-4 w-4 shrink-0 ${className}`} strokeWidth={1.75} aria-hidden />;
}

// Lowercase and strip diacritics so "kok" matches "Kök" and "light.kok_taklampa".
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type DeviceForm = { name: string; allowed: string[] };

function DeviceEditor({
  form,
  members,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: DeviceForm;
  members: Member[];
  submitLabel: string;
  onChange: (form: DeviceForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const everyone = form.allowed.length === 0;

  function toggleMember(id: string) {
    // Empty list means "everyone"; start from all members when narrowing down.
    const base = everyone ? members.map((m) => m.id) : form.allowed;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange({ ...form, allowed: next.length === members.length ? [] : next });
  }

  return (
    <form
      className="mt-2 space-y-3 rounded-lg border border-edge bg-base p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.name.trim()) onSubmit();
      }}
    >
      <div>
        <label className="label">{t("smarthome.displayName")}</label>
        <input
          className="input"
          value={form.name}
          maxLength={200}
          autoFocus
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder={t("smarthome.displayNamePh")}
        />
      </div>
      <div>
        <p className="label">{t("smarthome.whoCanControl")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-700"
              checked={everyone}
              onChange={() => onChange({ ...form, allowed: [] })}
            />
            {t("smarthome.everyone")}
          </label>
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-700"
                checked={everyone || form.allowed.includes(m.id)}
                onChange={() => toggleMember(m.id)}
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              {m.display_name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" type="submit" disabled={!form.name.trim()}>
          {submitLabel}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export default function SmartHomeDevices({
  devices,
  members,
  homes = [],
}: {
  devices: SmarthomeDevice[];
  members: Member[];
  homes?: HomeConn[];
}) {
  const { t } = useI18n();
  // Which Home Assistant to pick from: the main one ("") or another home's (2.8.4).
  const [source, setSource] = useState("");
  // A family with only another home's Home Assistant picks from that one.
  useEffect(() => {
    if (!source && homes.length > 0 && !homes.some((h) => h.kind !== "gateway")) setSource(homes[0].id);
  }, [homes, source]);
  const homeName = (id: string | null | undefined) => {
    const h = homes.find((x) => x.id === id);
    return h ? h.name || h.property_name || t("homes.main") : null;
  };
  // What the chosen Home Assistant offers, from the cache; Refresh asks it again.
  const entitiesPath = `/api/smarthome/entities${source ? `?connection_id=${source}` : ""}`;
  const entitiesQuery = useApi<SmarthomeEntity[]>(entitiesPath);
  const entities = entitiesQuery.data ?? null;
  const loading = entitiesQuery.isFetching;
  const loadError = entitiesQuery.isError && !entitiesQuery.data;
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<SmartDomain | "all">("all");
  const [adding, setAdding] = useState<string | null>(null); // entity_id being added
  const [editing, setEditing] = useState<string | null>(null); // device id being edited
  const [form, setForm] = useState<DeviceForm>({ name: "", allowed: [] });
  const [error, setError] = useState("");


  const haNames = useMemo(() => new Map((entities ?? []).map((e) => [e.entity_id, e.name])), [entities]);

  const available = useMemo(() => {
    const main = homes.find((h) => h.kind !== "gateway")?.id;
    const exposed = new Set(devices.filter((d) => (d.connection_id ?? main) === (source || main)).map((d) => d.entity_id));
    return (entities ?? [])
      .filter((e) => !exposed.has(e.entity_id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entities, devices, homes, source]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: available.length };
    for (const e of available) c[e.domain] = (c[e.domain] ?? 0) + 1;
    return c;
  }, [available]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return available.filter(
      (e) =>
        (domain === "all" || e.domain === domain) &&
        (!q || normalize(e.name).includes(q) || normalize(e.entity_id).includes(q))
    );
  }, [available, domain, query]);

  async function addDevice(entity: SmarthomeEntity) {
    setError("");
    try {
      await api.post("/api/smarthome/devices", {
        entity_id: entity.entity_id,
        display_name: form.name.trim(),
        domain: entity.domain,
        position: devices.length,
        allowed_user_ids: form.allowed,
        connection_id: source || null,
      });
      setAdding(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function saveDevice(device: SmarthomeDevice) {
    setError("");
    try {
      await api.patch(`/api/smarthome/devices/${device.id}`, {
        entity_id: device.entity_id,
        display_name: form.name.trim(),
        domain: device.domain,
        position: device.position,
        allowed_user_ids: form.allowed,
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function removeDevice(device: SmarthomeDevice) {
    if (!confirm(t("common.confirmRemove", { name: device.display_name }))) return;
    await api.del(`/api/smarthome/devices/${device.id}`);
  }

  function stateLabel(state: string): string {
    const known = ["on", "off", "open", "closed", "opening", "closing", "cleaning", "docked", "returning", "paused", "idle", "error", "unavailable", "heat", "cool", "auto", "heat_cool", "dry", "fan_only"];
    if (known.includes(state)) return t(`smarthome.state.${state}` as TranslationKey);
    return /^\d{4}-/.test(state) ? "" : state; // scenes report their last activation time as state
  }

  function whoLabel(allowed: string[]): string {
    if (allowed.length === 0) return t("smarthome.everyone");
    return members
      .filter((m) => allowed.includes(m.id))
      .map((m) => m.display_name)
      .join(", ");
  }

  return (
    <div className="mt-5 space-y-6">
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("smarthome.devices")} ({devices.length})
        </h3>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">{t("smarthome.noDevicesAdmin")}</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((dev) => (
              <li key={dev.id} className="rounded-lg border border-edge px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                    <DomainIcon domain={dev.domain} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{dev.display_name}</p>
                    <p className="truncate text-xs text-muted">
                      {haNames.get(dev.entity_id) && haNames.get(dev.entity_id) !== dev.display_name
                        ? `${t("smarthome.haName", { name: haNames.get(dev.entity_id) ?? "" })} · `
                        : ""}
                      {homes.length > 1 && homeName(dev.connection_id ?? homes.find((h) => h.kind !== "gateway")?.id) ? `${homeName(dev.connection_id ?? homes.find((h) => h.kind !== "gateway")?.id)} · ` : ""}
                      {whoLabel(dev.allowed_user_ids)}
                    </p>
                  </div>
                  <button
                    className="rounded p-1.5 text-muted hover:bg-base hover:text-ink"
                    onClick={() => {
                      setAdding(null);
                      setEditing(editing === dev.id ? null : dev.id);
                      setForm({ name: dev.display_name, allowed: dev.allowed_user_ids });
                    }}
                    aria-label={t("smarthome.edit")}
                    title={t("smarthome.edit")}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    className="rounded p-1.5 text-muted hover:bg-base hover:text-red-700"
                    onClick={() => removeDevice(dev)}
                    aria-label={t("common.remove")}
                    title={t("common.remove")}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
                {editing === dev.id && (
                  <DeviceEditor
                    form={form}
                    members={members}
                    submitLabel={t("smarthome.save")}
                    onChange={setForm}
                    onSubmit={() => saveDevice(dev)}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("smarthome.addFromHa")}</h3>
          <button
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
            onClick={() => void refreshApi(entitiesPath)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2} aria-hidden />
            {t("smarthome.refresh")}
          </button>
        </div>
        {homes.length > 1 && (
          <select className="input mb-2 w-auto text-sm" value={source} onChange={(e) => setSource(e.target.value)} aria-label={t("homes.pickFrom")}>
            {homes.map((h) => (
              <option key={h.id} value={h.kind === "gateway" ? h.id : ""} disabled={h.kind === "gateway" && (!h.online || h.pairing)}>
                {homeName(h.id)}
                {h.kind === "gateway" && !h.online ? ` (${t("homes.offline")})` : ""}
              </option>
            ))}
          </select>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} aria-hidden />
          <input
            className="input pl-9"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("smarthome.searchPh")}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(["all", ...SMART_DOMAINS] as const).filter((d) => d === "all" || counts[d]).map((d) => (
            <button
              key={d}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                domain === d ? "border-accent bg-accent/15 text-ink" : "border-edge text-muted hover:text-ink"
              }`}
              onClick={() => setDomain(d)}
            >
              {d !== "all" && <DomainIcon domain={d} className="h-3.5 w-3.5" />}
              {t(`smarthome.filter.${d}` as TranslationKey)}
              <span className="text-muted">{counts[d] ?? 0}</span>
            </button>
          ))}
        </div>

        {loadError && <p className="mt-3 text-sm text-red-700">{t("smarthome.loadError")}</p>}
        {entities === null && loading && <p className="mt-3 text-sm text-muted">{t("common.loading")}</p>}

        {entities !== null && (
          <>
            <p className="mt-3 text-xs text-muted">{t("smarthome.showing", { n: visible.length, total: available.length })}</p>
            <ul className="mt-1 max-h-96 divide-y divide-edge overflow-y-auto rounded-lg border border-edge">
              {visible.length === 0 && <li className="px-3 py-4 text-sm text-muted">{t("smarthome.noMatches")}</li>}
              {visible.map((ent) => (
                <li key={ent.entity_id} className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <DomainIcon domain={ent.domain} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{ent.name}</p>
                      <p className="truncate text-xs text-muted">{ent.entity_id}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        isActive(ent.domain, ent.state) ? "bg-accent/15 text-accent" : "bg-base text-muted"
                      }`}
                    >
                      {stateLabel(ent.state)}
                    </span>
                    {adding !== ent.entity_id && (
                      <button
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-edge px-2.5 py-1 text-xs font-semibold hover:bg-base"
                        onClick={() => {
                          setEditing(null);
                          setAdding(ent.entity_id);
                          setForm({ name: ent.name, allowed: [] });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        {t("common.add")}
                      </button>
                    )}
                  </div>
                  {adding === ent.entity_id && (
                    <DeviceEditor
                      form={form}
                      members={members}
                      submitLabel={t("smarthome.addDevice")}
                      onChange={setForm}
                      onSubmit={() => addDevice(ent)}
                      onCancel={() => setAdding(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
