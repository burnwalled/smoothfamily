"use client";

// The little ones' mode (2.5.5): what a child who can't read yet sees instead of the app. Big
// picture cards in order – tap one when it's done – a little fanfare for each, and a sticker for
// the album when a whole routine or task is done. A grown-up gets out by holding the lock and
// answering a sum.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { EasyBackend, EasyDay } from "@/lib/easy";
import { useI18n } from "@/lib/i18n";

const HOLD_MS = 2000;
const IDLE_CLOSE_MS = 3 * 60_000;
const CONFETTI = ["⭐", "🎉", "✨", "🌟", "🎈", "💛"];

function tone(notes: number[], step = 0.12) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const at = ctx.currentTime + i * step;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + step * 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + step * 1.8);
    });
    window.setTimeout(() => ctx.close(), (notes.length * step + 0.5) * 1000);
  } catch {}
}

const chime = () => tone([784, 1047]);
const fanfare = () => tone([523, 659, 784, 1047, 784, 1047], 0.14);

function Celebration({ sticker, onClose }: { sticker: string; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const id = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <button className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-black/60" onClick={onClose} aria-label={t("easy.wellDone")}>
      <style>{`
        @keyframes sf-fall { from { transform: translateY(-10vh) rotate(0deg); } to { transform: translateY(110vh) rotate(540deg); } }
        @keyframes sf-pop { 0% { transform: scale(0.2); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
      `}</style>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute top-0 text-4xl"
          style={{ left: `${(i * 37) % 100}%`, animation: `sf-fall ${2.2 + (i % 5) * 0.4}s linear ${(i % 7) * 0.15}s forwards`, transform: "translateY(-10vh)" }}
        >
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
      <span className="text-[9rem] leading-none" style={{ animation: "sf-pop 0.6s ease-out" }} aria-hidden>
        {sticker}
      </span>
      <span className="mt-4 rounded-full bg-white px-6 py-2 text-3xl font-extrabold text-ink">{t("easy.wellDone")}</span>
      <span className="mt-2 text-xl font-semibold text-white">{t("easy.newSticker")}</span>
    </button>
  );
}

/** Hold the lock for a while, then a sum: easy for a grown-up, not by accident for a three-year-old. */
function GrownUpGate({ onPass }: { onPass: () => void }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState<{ a: number; b: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      setAsking({ a: 3 + Math.floor(Math.random() * 7), b: 4 + Math.floor(Math.random() * 6) });
    }, HOLD_MS);
  };
  const stop = () => {
    setHolding(false);
    window.clearTimeout(timer.current);
  };
  return (
    <>
      <button
        className={`flex items-center gap-1 rounded-full border border-edge px-3 py-2 text-xs text-muted ${holding ? "bg-accent-soft" : ""}`}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t("easy.grownUp")}
        title={t("easy.grownUpHold")}
      >
        <Lock className="h-4 w-4" aria-hidden />
        {t("easy.grownUp")}
      </button>
      {asking && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t("easy.grownUp")}>
          <form
            className="card w-full max-w-xs space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(answer) === asking.a + asking.b) onPass();
              else {
                setAsking(null);
                setAnswer("");
              }
            }}
          >
            <p className="font-semibold">{t("easy.grownUpSum", { a: asking.a, b: asking.b })}</p>
            <input className="input w-full" inputMode="numeric" autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label={t("easy.answer")} />
            <div className="flex gap-2">
              <button className="btn-primary">{t("easy.open")}</button>
              <button type="button" className="btn-ghost" onClick={() => setAsking(null)}>{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Card({
  picture,
  label,
  done,
  next,
  onTap,
}: {
  picture: string;
  label: string;
  done: boolean;
  next: boolean;
  onTap: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="relative">
      <button
        className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-3xl border-4 p-3 text-center shadow-sm transition active:scale-95 ${
          done ? "border-emerald-400 bg-emerald-50 opacity-70" : next ? "animate-pulse border-accent bg-surface" : "border-edge bg-surface"
        }`}
        onClick={onTap}
        aria-pressed={done}
        aria-label={done ? t("easy.doneCard", { label }) : label}
      >
        <span className="text-6xl leading-none sm:text-7xl" aria-hidden>{picture}</span>
        <span className="text-base font-bold leading-tight sm:text-lg">{label}</span>
        {done && (
          <span className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white" aria-hidden>
            <Check className="h-6 w-6" strokeWidth={3} />
          </span>
        )}
      </button>
    </li>
  );
}

export default function EasyHome({ backend, onGrownUp, onClose }: { backend: EasyBackend; onGrownUp?: () => void; onClose?: () => void }) {
  const { t } = useI18n();
  const [day, setDay] = useState<EasyDay | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [album, setAlbum] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  const endCelebration = useCallback(() => setCelebrate(null), []);

  const load = useCallback(() => {
    backend.load().then((d) => { setDay(d); setError(false); }).catch(() => setError(true));
  }, [backend]);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  // On the kitchen display: back to the screen when nobody has touched it for a while.
  // (The screen redraws its clock often, so the latest onClose is kept aside.)
  const close = useRef(onClose);
  close.current = onClose;
  const closable = Boolean(onClose);
  useEffect(() => {
    if (!closable) return;
    const fire = () => close.current?.();
    let idle = window.setTimeout(fire, IDLE_CLOSE_MS);
    const wake = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(fire, IDLE_CLOSE_MS);
    };
    window.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointerdown", wake);
    };
  }, [closable]);

  async function after(call: Promise<EasyDay>, sound: boolean) {
    try {
      const next = await call;
      setDay(next);
      if (next.new_sticker) {
        fanfare();
        setCelebrate(next.new_sticker);
      } else if (sound) chime();
    } catch {
      load();
    }
  }

  const tapStep = (id: string, done: boolean) => {
    if (!done) navigator.vibrate?.(40);
    return after(backend.step(id, done), !done);
  };

  if (!day) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-base text-2xl">
        {error ? t("easy.offline") : "⭐"}
      </div>
    );
  }

  const nothing = day.routines.every((r) => r.state !== "none") && day.tasks.every((task) => task.state !== "none");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-base">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full text-2xl font-extrabold text-white" style={{ backgroundColor: day.color }} aria-hidden>
              {day.name.slice(0, 1).toUpperCase()}
            </span>
            <h1 className="text-3xl font-extrabold">{t("easy.hello", { name: day.name })}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-xl font-bold shadow-sm"
              onClick={() => (backend.stickers ? backend.stickers().then(setAlbum).catch(() => setAlbum(day.stickers_today)) : setAlbum(day.stickers_today))}
              aria-label={t("easy.album", { count: day.stickers })}
            >
              <span aria-hidden>🏆</span>
              {day.stickers}
            </button>
            {onGrownUp && <GrownUpGate onPass={onGrownUp} />}
            {onClose && (
              <button className="btn-ghost px-3" onClick={onClose} aria-label={t("common.close")}>
                <X className="h-7 w-7" aria-hidden />
              </button>
            )}
          </div>
        </header>

        {day.stickers_today.length > 0 && (
          <p className="text-4xl tracking-widest" aria-label={t("easy.todayStickers")}>
            {day.stickers_today.join(" ")}
          </p>
        )}

        {day.routines.map((routine) => {
          const nextStep = routine.steps.find((s) => !s.done);
          const finished = routine.state !== "none";
          return (
            <section key={routine.id} className="space-y-3">
              <h2 className="flex items-center gap-3 text-2xl font-extrabold">
                <span className="text-4xl" aria-hidden>{routine.picture}</span>
                {routine.name}
                {finished && <span className="rounded-full bg-emerald-100 px-3 py-1 text-base text-emerald-800">{t("easy.routineDone")}</span>}
              </h2>
              {/* The path: how far along */}
              <div className="flex items-center gap-1" aria-hidden>
                {routine.steps.map((s) => (
                  <span key={s.id} className={`h-3 flex-1 rounded-full ${s.done ? "bg-emerald-400" : "bg-edge"}`} />
                ))}
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {routine.steps.map((s) => (
                  <Card
                    key={s.id}
                    picture={s.picture}
                    label={s.label}
                    done={s.done}
                    next={!finished && nextStep?.id === s.id}
                    onTap={() => (finished && s.done ? chime() : tapStep(s.id, s.done))}
                  />
                ))}
              </ul>
            </section>
          );
        })}

        {day.tasks.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-3 text-2xl font-extrabold">
              <span className="text-4xl" aria-hidden>⭐</span>
              {t("easy.tasks")}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {day.tasks.map((task) => (
                <Card
                  key={task.id}
                  picture={task.picture || "⭐"}
                  label={task.title}
                  done={task.state !== "none"}
                  next={false}
                  onTap={() => (task.state !== "none" ? chime() : after(backend.task(task.id), true))}
                />
              ))}
            </ul>
          </section>
        )}

        {nothing && (
          <p className="rounded-3xl bg-surface p-6 text-center text-2xl font-bold">
            <span className="mb-2 block text-6xl" aria-hidden>🌟</span>
            {day.routines.length || day.tasks.length ? t("easy.allDone") : t("easy.nothingToday")}
          </p>
        )}
      </div>

      {celebrate && <Celebration sticker={celebrate} onClose={endCelebration} />}

      {album && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-base p-4" role="dialog" aria-modal="true" aria-label={t("easy.albumTitle")}>
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-extrabold">🏆 {t("easy.albumTitle")}</h2>
              <button className="btn-ghost px-3" onClick={() => setAlbum(null)} aria-label={t("common.close")}>
                <X className="h-7 w-7" aria-hidden />
              </button>
            </div>
            {album.length === 0 ? (
              <p className="text-xl text-muted">{t("easy.albumEmpty")}</p>
            ) : (
              <ul className="grid grid-cols-5 gap-3 sm:grid-cols-8">
                {album.map((s, i) => (
                  <li key={i} className="grid aspect-square place-items-center rounded-2xl bg-surface text-4xl shadow-sm">{s}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
