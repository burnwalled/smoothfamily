"use client";

// An address field (3.4.0): real addresses from OpenStreetMap as one types (asked by the server,
// so only the words leave it), and the address on a map once it's there. Free text still works –
// a summer cottage without a street address is an address too.
import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/query";
import { mapLinks } from "@/lib/maps";

type Place = { label: string; detail: string; lat: number | null; lon: number | null };
type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  "aria-label"?: string;
  // Show the links to the map under the field.
  showMap?: boolean;
};

export function MapLinks({ address, className = "" }: { address: string; className?: string }) {
  const { t } = useI18n();
  if (!address.trim()) return null;
  const links = mapLinks(address);
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${className}`}>
      <MapPin className="h-3.5 w-3.5 text-muted" aria-hidden />
      <a className="font-semibold text-accent hover:underline" href={links.osm} target="_blank" rel="noreferrer">{t("places.onMap")}</a>
      <a className="text-muted hover:underline" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
      <a className="text-muted hover:underline" href={links.apple} target="_blank" rel="noreferrer">{t("places.appleMaps")}</a>
    </span>
  );
}

export default function AddressInput({ value, onChange, className = "input", placeholder, maxLength = 300, showMap = true, ...rest }: Props) {
  const { t } = useI18n();
  const enabled = useApi<{ enabled: boolean }>("/api/places/status").data?.enabled ?? false;
  const [found, setFound] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);
  const list = useId();

  useEffect(() => {
    if (!enabled || !typed.current || value.trim().length < 3) {
      setFound([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api.get<Place[]>(`/api/places?q=${encodeURIComponent(value.trim())}`)
        .then((r) => {
          if (!alive) return;
          setFound(r);
          setOpen(r.length > 0);
          setActive(-1);
        })
        .catch(() => alive && setFound([]));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value, enabled]);

  const pick = (p: Place) => {
    typed.current = false;
    onChange(p.label);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        {...rest}
        className={className}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${list}-${active}` : undefined}
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => found.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(found.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(found[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id={list} role="listbox" aria-label={t("places.suggestions")} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-edge bg-surface text-sm shadow-lg">
          {found.map((p, i) => (
            <li key={p.label} id={`${list}-${i}`} role="option" aria-selected={i === active} className={`cursor-pointer px-3 py-2 ${i === active ? "bg-accent-soft" : "hover:bg-base"}`} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="block font-semibold">{p.label}</span>
              {p.detail && <span className="block text-xs text-muted">{p.detail}</span>}
            </li>
          ))}
          <li className="border-t border-edge px-3 py-1 text-right text-[10px] text-muted" aria-hidden>© OpenStreetMap</li>
        </ul>
      )}
      {showMap && <MapLinks address={value} className="mt-1" />}
    </div>
  );
}
