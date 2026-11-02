"use client";

// Tasks → The little ones' mode (2.5.5): the adults choose which children see pictures instead of
// the app, make their routines (from ready-made ones or their own) and give their tasks pictures.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, Eye, Plus, Trash2 } from "lucide-react";
import { api, Task } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, refreshApi, setApiData, useApi } from "@/lib/query";
import { useMe } from "@/components/Shell";
import PageTitle, { EmptyState } from "@/components/PageTitle";
import EasyHome from "@/components/easy/EasyHome";
import { EasyBackend, EasyChild, EasyDay, EasyRoutine, PICTURES, pictureLabel, TEMPLATES, templateName } from "@/lib/easy";
import { weekdayNames } from "@/lib/taskSchedule";

type Draft = {
  id: string | null;
  name: string;
  picture: string;
  weekdays: number[];
  points: number;
  requires_approval: boolean;
  steps: { id: string | null; picture: string; label: string }[];
};

function PicturePicker({ value, onPick, label }: { value: string; onPick: (picture: string, key: string) => void; label: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="grid h-12 w-12 place-items-center rounded-xl border border-edge bg-surface text-3xl" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open}>
        {value}
      </button>
      {open && (
        <ul className="absolute left-0 top-14 z-20 grid w-72 grid-cols-6 gap-1 rounded-xl border border-edge bg-surface p-2 shadow-lg" role="listbox" aria-label={label}>
          {PICTURES.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                className={`grid h-11 w-11 place-items-center rounded-lg text-2xl hover:bg-base ${p.picture === value ? "bg-accent-soft" : ""}`}
                role="option"
                aria-selected={p.picture === value}
                title={t(pictureLabel(p.key))}
                aria-label={t(pictureLabel(p.key))}
                onClick={() => {
                  onPick(p.picture, p.key);
                  setOpen(false);
                }}
              >
                {p.picture}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoutineEditor({ draft, onChange, onSave, onCancel, busy }: { draft: Draft; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const { t, dateLocale } = useI18n();
  const days = weekdayNames(dateLocale, "short");
  const setStep = (i: number, patch: Partial<Draft["steps"][number]>) => onChange({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, by: number) => {
    const steps = [...draft.steps];
    const [row] = steps.splice(i, 1);
    steps.splice(i + by, 0, row);
    onChange({ ...draft, steps });
  };
  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <PicturePicker value={draft.picture} label={t("easy.routinePicture")} onPick={(picture) => onChange({ ...draft, picture })} />
        <label className="min-w-48 flex-1 text-sm">
          <span className="text-muted">{t("easy.routineName")}</span>
          <input className="input mt-1 w-full" value={draft.name} maxLength={80} required onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </label>
        <label className="w-24 text-sm">
          <span className="text-muted">{t("easy.points")}</span>
          <input className="input mt-1 w-full" type="number" min={1} max={1000} value={draft.points} onChange={(e) => onChange({ ...draft, points: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm text-muted">{t("easy.days")}</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {days.map((name, d) => {
            const on = draft.weekdays.length === 0 || draft.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft font-semibold" : "border-edge text-muted"}`}
                onClick={() => {
                  const current = draft.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : draft.weekdays;
                  const next = on ? current.filter((x) => x !== d) : [...current, d].sort();
                  // Every day is stored as "no days chosen"; none at all isn't a routine.
                  if (next.length === 0) return;
                  onChange({ ...draft, weekdays: next.length === 7 ? [] : next });
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={draft.requires_approval} onChange={(e) => onChange({ ...draft, requires_approval: e.target.checked })} />
        {t("easy.approval")}
      </label>

      <div>
        <p className="text-sm font-semibold">{t("easy.steps")}</p>
        <ol className="mt-2 space-y-2">
          {draft.steps.map((step, i) => (
            <li key={step.id ?? `new-${i}`} className="flex items-center gap-2">
              <span className="w-5 text-right text-sm text-muted">{i + 1}</span>
              <PicturePicker
                value={step.picture}
                label={t("easy.stepPicture", { n: i + 1 })}
                onPick={(picture, key) => {
                  // A new picture brings its name along unless one was written.
                  const named = PICTURES.some((p) => t(pictureLabel(p.key)) === step.label) || !step.label.trim();
                  setStep(i, named ? { picture, label: t(pictureLabel(key)) } : { picture });
                }}
              />
              <input className="input min-w-0 flex-1" value={step.label} maxLength={80} required aria-label={t("easy.stepLabel", { n: i + 1 })} onChange={(e) => setStep(i, { label: e.target.value })} />
              <button type="button" className="btn-ghost px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("easy.up")}>
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="btn-ghost px-2" disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)} aria-label={t("easy.down")}>
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="btn-ghost px-2 text-red-700"
                disabled={draft.steps.length === 1}
                onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
                aria-label={t("common.remove")}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        {draft.steps.length < 20 && (
          <button type="button" className="btn-ghost mt-2 inline-flex items-center gap-1 border border-edge" onClick={() => onChange({ ...draft, steps: [...draft.steps, { id: null, picture: "⭐", label: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("easy.addStep")}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{t("easy.save")}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}

export default function LittleOnesPage() {
  const { t } = useI18n();
  const me = useMe();
  const [chosenChild, setChildId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const adult = me.role !== "child";

  // From the cache: the writes below invalidate the routines and the tasks (a routine is a task).
  const childrenQuery = useApi<EasyChild[]>(adult ? "/api/easy/children" : null);
  const children = childrenQuery.data ?? (childrenQuery.isError ? NONE : null);
  const childId = chosenChild || children?.[0]?.id || "";
  const routinesPath = childId ? `/api/easy/routines?user_id=${childId}` : null;
  const routines = useApi<EasyRoutine[]>(routinesPath).data ?? NONE;
  const allTasks = useApi<Task[]>(childId ? "/api/tasks" : null).data ?? NONE;
  const tasks = allTasks.filter((r) => r.assignee_id === childId && r.active);

  const child = children?.find((c) => c.id === childId) ?? null;
  const routineTasks = new Set(routines.map((r) => r.task_id));
  const previewBackend = useMemo<EasyBackend>(
    () => ({
      load: () => api.get(`/api/easy/today?user_id=${childId}`),
      step: (id, undo) => (undo ? (api.del(`/api/easy/steps/${id}/done?user_id=${childId}`) as unknown as Promise<EasyDay>) : api.post<EasyDay>(`/api/easy/steps/${id}/done?user_id=${childId}`)),
      task: (id) => api.post(`/api/easy/tasks/${id}/done?user_id=${childId}`),
      stickers: () => api.get(`/api/easy/stickers?user_id=${childId}`),
    }),
    [childId],
  );

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function fromTemplate(key: string | null) {
    const tpl = TEMPLATES.find((x) => x.key === key);
    setDraft({
      id: null,
      name: tpl ? t(templateName(tpl.key)) : "",
      picture: tpl?.picture ?? "⭐",
      weekdays: [],
      points: 5,
      requires_approval: false,
      steps: tpl ? tpl.steps.map((k) => ({ id: null, picture: PICTURES.find((p) => p.key === k)!.picture, label: t(pictureLabel(k)) })) : [{ id: null, picture: "⭐", label: "" }],
    });
  }

  function save() {
    if (!draft) return;
    const body = { user_id: childId, name: draft.name.trim(), picture: draft.picture, weekdays: draft.weekdays, points: draft.points, requires_approval: draft.requires_approval, steps: draft.steps.map((s) => ({ id: s.id, picture: s.picture, label: s.label.trim() })) };
    return run(async () => {
      if (draft.id) await api.put(`/api/easy/routines/${draft.id}`, body);
      else await api.post("/api/easy/routines", body);
      setDraft(null);
    });
  }

  if (!adult) {
    return <p className="text-sm text-muted">{t("easy.adultsOnly")}</p>;
  }

  return (
    <>
      <Link href="/tasks" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {t("tasks.title")}
      </Link>
      <PageTitle title={t("easy.title")} />
      <p className="mt-1 text-sm text-muted">{t("easy.intro")}</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {children && children.length === 0 && <div className="mt-4"><EmptyState>{t("easy.noChildren")}</EmptyState></div>}

      {children && children.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist">
            {children.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === childId}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${c.id === childId ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}
                onClick={() => {
                  setChildId(c.id);
                  setDraft(null);
                }}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                {c.display_name}
                {c.easy_mode && <span aria-hidden>🧸</span>}
              </button>
            ))}
          </div>

          {child && (
            <section className="card mt-4 space-y-2 p-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary-700"
                  checked={child.easy_mode}
                  onChange={(e) => {
                    // Shown at once; put back if the server says no.
                    const on = e.target.checked;
                    const set = (value: boolean) => setApiData<EasyChild[]>("/api/easy/children", (all) => all?.map((c) => (c.id === child.id ? { ...c, easy_mode: value } : c)));
                    set(on);
                    run(() => api.put(`/api/easy/children/${child.id}`, { easy_mode: on }).catch((err) => { set(!on); throw err; }));
                  }}
                />
                <span>
                  <span className="font-semibold">{t("easy.turnOn", { name: child.display_name })}</span>
                  <span className="block text-xs text-muted">{t("easy.turnOnHelp")}</span>
                </span>
              </label>
              <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => setPreview(true)}>
                <Eye className="h-4 w-4" aria-hidden />
                {t("easy.preview", { name: child.display_name })}
              </button>
            </section>
          )}

          <section className="mt-6 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("easy.routines")}</h2>
            {routines.length === 0 && !draft && <EmptyState>{t("easy.noRoutines")}</EmptyState>}
            <ul className="space-y-2">
              {routines.map((r) => (
                <li key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <span className="text-3xl" aria-hidden>{r.picture}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.name}</p>
                    <p className="truncate text-lg" aria-label={r.steps.map((s) => s.label).join(", ")}>{r.steps.map((s) => s.picture).join(" ")}</p>
                  </div>
                  <button
                    className="btn-ghost border border-edge"
                    onClick={() => setDraft({ id: r.id, name: r.name, picture: r.picture, weekdays: r.weekdays, points: r.points, requires_approval: r.requires_approval, steps: r.steps.map((s) => ({ id: s.id, picture: s.picture, label: s.label })) })}
                  >
                    {t("easy.edit")}
                  </button>
                  <button className="btn-ghost px-2 text-red-700" onClick={() => run(async () => { await api.del(`/api/easy/routines/${r.id}`); })} aria-label={t("easy.removeRoutine", { name: r.name })}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {draft ? (
              <RoutineEditor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} busy={busy} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.key} className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => fromTemplate(tpl.key)}>
                    <span aria-hidden>{tpl.picture}</span>
                    {t(templateName(tpl.key))}
                  </button>
                ))}
                <button className="btn-ghost inline-flex items-center gap-1 border border-edge" onClick={() => fromTemplate(null)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {t("easy.ownRoutine")}
                </button>
              </div>
            )}
          </section>

          <section className="mt-6 space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("easy.taskPictures")}</h2>
            <p className="text-xs text-muted">{t("easy.taskPicturesHelp")}</p>
            {tasks.filter((task) => !routineTasks.has(task.id)).length === 0 ? (
              <p className="text-sm text-muted">{t("easy.noTasks")}</p>
            ) : (
              <ul className="space-y-2">
                {tasks
                  .filter((task) => !routineTasks.has(task.id))
                  .map((task) => (
                    <li key={task.id} className="flex items-center gap-3">
                      <PicturePicker
                        value={task.picture || "⭐"}
                        label={t("easy.taskPicture", { title: task.title })}
                        onPick={(picture) => run(async () => { await api.patch(`/api/tasks/${task.id}`, { picture }); })}
                      />
                      <span className="text-sm">{task.title}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}

      {preview && child && <EasyHome backend={previewBackend} onClose={() => { setPreview(false); if (routinesPath) void refreshApi(routinesPath); }} />}
    </>
  );
}
