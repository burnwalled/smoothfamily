"use client";

// Scanning groceries into the pantry, or taking stock of one place, with the camera (#69). The
// camera stays on; every barcode it reads lands in a list (the same one again counts up), and the
// list is saved in one go once names and amounts look right. Used by the pantry page and by the
// kitchen display, which pass in how to reach the server.
//
// Browsers with their own barcode reader (Chrome on Android) use it; the others (iPhone, iPad)
// use zxing compiled to WebAssembly, served from /zxing – nothing is fetched from elsewhere.
import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, CameraOff, Check, Minus, Plus, Trash2, X } from "lucide-react";
import { api, PantryItem, PantryPlace, ScanLine, ScanProduct, ScanResult } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";

export type ScanBackend = {
  lookup: (code: string) => Promise<ScanProduct>;
  save: (body: { mode: "add" | "count"; place: PantryPlace | null; lines: ScanLine[] }) => Promise<ScanResult>;
  remove: (id: string) => Promise<void>;
};

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];
const PLACES: PantryPlace[] = ["freezer", "fridge", "pantry"];
// The same code seen again within this time is the same package still in front of the camera.
const SAME_MS = 1500;
const DRAFT = "sf.pantry.scan";

/** Today + days as YYYY-MM-DD in local time. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function makeDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (formats.includes("ean_13")) return new native({ formats });
  }
  const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path) });
  return new BarcodeDetector({ formats: FORMATS as never });
}

function beep() {
  try {
    navigator.vibrate?.(60);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1400;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {}
}

/** The camera, reading barcodes until it is closed. */
function Camera({ onCode, onFail }: { onCode: (code: string) => void; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  handler.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const seen = new Map<string, number>();
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const el = video.current!;
        el.srcObject = stream;
        await el.play();
        const detector = await makeDetector();
        const tick = async () => {
          if (stopped) return;
          if (el.readyState >= 2) {
            const found = await detector.detect(el).catch(() => []);
            const now = Date.now();
            for (const { rawValue } of found) {
              const last = seen.get(rawValue) ?? 0;
              seen.set(rawValue, now);
              if (now - last > SAME_MS) handler.current(rawValue);
            }
          }
          timer = window.setTimeout(tick, 150);
        };
        tick();
      } catch {
        if (!stopped) onFail();
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onFail]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={video} className="mx-auto max-h-[38vh] w-full object-cover" muted playsInline aria-hidden />
      {/* Where to hold the barcode */}
      <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-lg border-2 border-white/70" />
    </div>
  );
}

type Row = ScanLine & { key: string; source: ScanProduct["source"] | "loading" };

function loadDraft(): { mode: "add" | "count"; place: PantryPlace; rows: Row[] } | null {
  try {
    const saved = localStorage.getItem(DRAFT);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export default function ScanSession({ backend, onClose, onSaved, large = false }: { backend: ScanBackend; onClose: () => void; onSaved?: () => void; large?: boolean }) {
  const { t, dateLocale } = useI18n();
  const draft = useRef(loadDraft()).current;
  const [mode, setMode] = useState<"add" | "count">(draft?.mode ?? "add");
  const [place, setPlace] = useState<PantryPlace>(draft?.place ?? "fridge");
  const [rows, setRows] = useState<Row[]>(draft?.rows.map((r) => (r.source === "loading" ? { ...r, source: "none" } : r)) ?? []);
  const [noCamera, setNoCamera] = useState(false);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<PantryItem[] | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (rows.length) localStorage.setItem(DRAFT, JSON.stringify({ mode, place, rows }));
      else localStorage.removeItem(DRAFT);
    } catch {}
  }, [mode, place, rows]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const change = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const scanned = useCallback(
    (code: string) => {
      beep();
      setError("");
      const same = rowsRef.current.find((r) => r.barcode === code);
      if (same) {
        setFlash(`+1 ${same.name || code}`);
        // The one just scanned goes to the top, where it can be changed.
        setRows((all) => {
          const now = all.find((r) => r.key === same.key) ?? same;
          return [{ ...now, amount: now.amount + 1 }, ...all.filter((r) => r.key !== same.key)];
        });
        return;
      }
      const row: Row = { key: `${code}-${Date.now()}`, barcode: code, name: "", amount: 1, unit: "", place, best_before: null, keeps_days: null, remember: true, source: "loading" };
      rowsRef.current = [row, ...rowsRef.current];
      setRows((all) => [row, ...all]);
      setFlash(code);
      backend
        .lookup(code)
        .then((p) => {
          setRows((all) =>
            all.map((r) =>
              r.barcode === code && r.source === "loading"
                ? {
                    ...r,
                    name: r.name || p.name,
                    unit: r.unit || p.unit,
                    place: mode === "count" ? r.place : p.place ?? r.place,
                    keeps_days: p.keeps_days,
                    // New groceries: the date it probably keeps until, ready to be changed to the one on the pack.
                    best_before: r.best_before ?? (mode === "add" && p.keeps_days !== null ? inDays(p.keeps_days) : null),
                    source: p.source,
                  }
                : r,
            ),
          );
          setFlash(p.name ? `+1 ${p.name}` : t("scan.unknown"));
        })
        .catch(() => setRows((all) => all.map((r) => (r.barcode === code && r.source === "loading" ? { ...r, source: "none" } : r))));
    },
    [backend, mode, place, t],
  );

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(""), 1800);
    return () => window.clearTimeout(id);
  }, [flash]);

  const failCamera = useCallback(() => setNoCamera(true), []);

  function addTyped() {
    const value = typed.trim();
    if (!value) return;
    setTyped("");
    if (/^\d{6,14}$/.test(value)) return scanned(value);
    setRows((all) => [{ key: `name-${Date.now()}`, barcode: null, name: value, amount: 1, unit: "", place, best_before: null, keeps_days: null, remember: false, source: "none" }, ...all]);
  }

  async function save() {
    if (rows.some((r) => !r.name.trim())) return setError(t("scan.nameAll"));
    setBusy(true);
    setError("");
    try {
      const lines: ScanLine[] = rows.map(({ key: _k, source: _s, ...line }) => ({ ...line, name: line.name.trim(), place: mode === "count" ? place : line.place }));
      const result = await backend.save({ mode, place: mode === "count" ? place : null, lines });
      setRows([]);
      onSaved?.();
      if (mode === "count" && result.missing.length) setMissing(result.missing);
      else setSavedCount(lines.reduce((sum, l) => sum + l.amount, 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const placeLabel = (p: PantryPlace) => t(`pantry.place.${p}` as TranslationKey);
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  const text = large ? "text-lg" : "text-sm";
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-base" role="dialog" aria-modal="true" aria-label={t("scan.title")}>
      <div className={`mx-auto max-w-3xl space-y-3 p-4 ${text}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Barcode className="h-6 w-6" strokeWidth={2} aria-hidden />
            {mode === "add" ? t("scan.title") : t("scan.countTitle")}
          </h2>
          <button className="btn-ghost px-3" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {missing ? (
          <section className="card space-y-3 p-4">
            <p className="font-semibold">{t("scan.missingTitle", { place: placeLabel(place) })}</p>
            <p className="text-muted">{t("scan.missingHelp")}</p>
            <ul className="divide-y divide-edge">
              {missing.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-semibold">{item.name}</span>
                  {item.best_before && <span className="text-muted">{day(item.best_before)}</span>}
                  <span className="ml-auto flex gap-2">
                    <button
                      className="btn-ghost border border-edge text-red-700"
                      onClick={() => backend.remove(item.id).then(() => { setMissing((m) => m?.filter((i) => i.id !== item.id) ?? null); onSaved?.(); }).catch(() => setError(t("common.error")))}
                    >
                      {t("scan.gone")}
                    </button>
                    <button className="btn-ghost border border-edge" onClick={() => setMissing((m) => m?.filter((i) => i.id !== item.id) ?? null)}>
                      {t("scan.stillThere")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {missing.length === 0 && <p className="text-muted">{t("scan.stockDone")}</p>}
            <button className="btn-primary" onClick={onClose}>{t("scan.done")}</button>
          </section>
        ) : savedCount !== null ? (
          <section className="card space-y-3 p-4">
            <p className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5 text-accent" aria-hidden />{t("scan.saved", { count: savedCount })}</p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => setSavedCount(null)}>{t("scan.more")}</button>
              <button className="btn-ghost border border-edge" onClick={onClose}>{t("scan.done")}</button>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-edge p-0.5" role="group" aria-label={t("scan.mode")}>
                {(["add", "count"] as const).map((m) => (
                  <button key={m} className={`rounded-md px-3 py-1.5 font-semibold ${mode === m ? "bg-accent text-white" : "text-muted"}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {m === "add" ? t("scan.modeAdd") : t("scan.modeCount")}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <span className="text-muted">{mode === "add" ? t("scan.placeNew") : t("scan.placeCount")}</span>
                <select className="input" value={place} onChange={(e) => setPlace(e.target.value as PantryPlace)}>
                  {PLACES.map((p) => <option key={p} value={p}>{placeLabel(p)}</option>)}
                </select>
              </label>
            </div>
            <p className="text-muted">{mode === "add" ? t("scan.helpAdd") : t("scan.helpCount")}</p>

            {noCamera ? (
              <p className="flex items-center gap-2 rounded-lg border border-edge p-3 text-muted">
                <CameraOff className="h-5 w-5" aria-hidden />
                {t("scan.noCamera")}
              </p>
            ) : (
              <div className="relative">
                <Camera onCode={scanned} onFail={failCamera} />
                {flash && (
                  <span role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 font-semibold text-white">
                    {flash}
                  </span>
                )}
              </div>
            )}

            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addTyped(); }}>
              <input className="input min-w-0 flex-1" value={typed} inputMode="text" placeholder={t("scan.typePh")} aria-label={t("scan.type")} onChange={(e) => setTyped(e.target.value)} />
              <button className="btn-ghost border border-edge" disabled={!typed.trim()}>{t("common.add")}</button>
            </form>

            {rows.length > 0 && (
              <ul className="card divide-y divide-edge" aria-label={t("scan.list")}>
                {rows.map((r) => (
                  <li key={r.key} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0 space-y-1">
                      <input
                        className={`input w-full ${!r.name.trim() && r.source !== "loading" ? "border-amber-500" : ""}`}
                        value={r.name}
                        maxLength={120}
                        placeholder={r.source === "loading" ? t("common.loading") : t("scan.whatIsIt")}
                        aria-label={t("scan.name")}
                        onChange={(e) => change(r.key, { name: e.target.value })}
                      />
                      <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                        {r.barcode && <span className="font-mono">{r.barcode}</span>}
                        {r.source === "family" && <span>{t("scan.known")}</span>}
                        {r.source === "lookup" && <span>{t("scan.fromLookup")}</span>}
                        {r.keeps_days !== null && !r.best_before && <span>{t("scan.keeps", { days: r.keeps_days })}</span>}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {mode === "add" && (
                        <select className="input" value={r.place} aria-label={t("pantry.where")} onChange={(e) => change(r.key, { place: e.target.value as PantryPlace })}>
                          {PLACES.map((p) => <option key={p} value={p}>{placeLabel(p)}</option>)}
                        </select>
                      )}
                      <input className="input w-36" type="date" value={r.best_before ?? ""} aria-label={t("pantry.bestBefore")} onChange={(e) => change(r.key, { best_before: e.target.value || null })} />
                      <span className="flex items-center gap-1">
                        <button className="btn-ghost border border-edge px-2" aria-label={t("scan.less")} onClick={() => change(r.key, { amount: Math.max(0, r.amount - 1) })}>
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <input
                          className="input w-14 text-center tabular-nums"
                          inputMode="decimal"
                          value={String(r.amount)}
                          aria-label={t("pantry.amount")}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(",", "."));
                            if (Number.isFinite(n) && n >= 0) change(r.key, { amount: n });
                          }}
                        />
                        <button className="btn-ghost border border-edge px-2" aria-label={t("scan.more1")} onClick={() => change(r.key, { amount: r.amount + 1 })}>
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      </span>
                      <button className="btn-ghost px-2 text-red-700" aria-label={t("common.remove")} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="text-red-700">{error}</p>}
            <div className="sticky bottom-0 flex items-center gap-2 bg-base py-3">
              <button className="btn-primary" disabled={busy || (rows.length === 0 && mode === "add")} onClick={save}>
                {mode === "add" ? t("scan.saveAdd", { count: total }) : t("scan.saveCount", { place: placeLabel(place) })}
              </button>
              {rows.length > 0 && (
                <button className="btn-ghost text-muted" onClick={() => setRows([])}>{t("scan.clear")}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Family admin → Integrations: look up unknown barcodes in Open Food Facts (off by default). */
export function BarcodeLookupSetting() {
  const { t } = useI18n();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ barcode_lookup: boolean }>("/api/pantry/settings").then((s) => setOn(s.barcode_lookup)).catch(() => {});
  }, []);
  if (on === null) return null;
  return (
    <div className="mt-6 border-t border-edge pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Barcode className="h-4 w-4" strokeWidth={2} aria-hidden />
        {t("scan.lookup")}
      </h3>
      <p className="mt-1 text-xs text-muted">{t("scan.lookupHelp")}</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary-700"
          checked={on}
          onChange={async (e) => setOn((await api.put<{ barcode_lookup: boolean }>("/api/pantry/settings", { barcode_lookup: e.target.checked })).barcode_lookup)}
        />
        {t("scan.lookup")}
      </label>
    </div>
  );
}
