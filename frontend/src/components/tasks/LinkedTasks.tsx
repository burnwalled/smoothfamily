"use client";

// The tasks that belong to a pet, a home or a vehicle (3.4.0) – with the same form as Tasks: any
// schedule (every other day, weekdays, the first Saturday …), points, and who does it. They are
// ordinary tasks, so they come on Today, earn points and can be taken in turns.
import { useState } from "react";
import { Pencil, Plus, Repeat, Star, Trash2 } from "lucide-react";
import { api, Member, Task } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { NONE, useApi } from "@/lib/query";
import { scheduleLabel } from "@/lib/taskSchedule";
import TaskEditor, { NEW_TASK, TaskDraft } from "@/components/TaskEditor";
import { useMe } from "@/components/Shell";

type Link = { pet_id: string } | { property_id: string } | { vehicle_id: string };

export default function LinkedTasks({ link, placeholder }: { link: Link; placeholder: string }) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [field, id] = Object.entries(link)[0] as [keyof Task, string];
  // Tasks are made and changed by the adults.
  const tasks = (useApi<Task[]>(adult ? "/api/tasks/manage" : null).data ?? NONE).filter((task) => task[field] === id && task.active);
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState("");
  const name = (memberId: string | null) => members.find((m) => m.id === memberId)?.display_name;

  async function save(draft: TaskDraft, taskId?: string) {
    setError("");
    try {
      if (taskId) await api.patch(`/api/tasks/${taskId}`, draft);
      else await api.post("/api/tasks?force=true", { ...draft, ...link });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function remove(task: Task) {
    if (!confirm(t("common.confirmRemove", { name: task.title }))) return;
    await api.del(`/api/tasks/${task.id}`).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
  }

  if (!adult) return null;
  return (
    <div className="space-y-2">
      {tasks.length === 0 && editing !== "new" && <p className="text-sm text-muted">{t("linkedTasks.none")}</p>}
      <ul className="space-y-1.5">
        {tasks.map((task) =>
          editing === task.id ? (
            <li key={task.id}>
              <TaskEditor task={task} members={members} saveLabel={t("tasks.save")} onSave={(d) => save(d, task.id)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-edge bg-base px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{task.title}</span>
                <span className="block text-xs text-muted">
                  {scheduleLabel(task, t, dateLocale)} · {task.rotation_user_ids.length >= 2 ? (
                    <><Repeat className="inline h-3 w-3" strokeWidth={2} aria-label={t("tasks.takeTurns")} /> {name(task.assignee_id)}</>
                  ) : (name(task.assignee_id) ?? t("tasks.anyone"))}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                {task.points}
                <Star className="h-3.5 w-3.5" strokeWidth={2} aria-label={t("tasks.points")} />
              </span>
              <button className="rounded p-1 text-muted hover:bg-surface hover:text-ink" onClick={() => setEditing(task.id)} aria-label={`${t("common.edit")}: ${task.title}`} title={t("common.edit")}>
                <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
              <button className="rounded p-1 text-muted hover:bg-surface hover:text-red-700" onClick={() => remove(task)} aria-label={`${t("common.remove")}: ${task.title}`} title={t("common.remove")}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          )
        )}
      </ul>
      {editing === "new" ? (
        <TaskEditor task={{ ...NEW_TASK, title: "" }} members={members} saveLabel={t("tasks.save")} onSave={(d) => save(d)} onCancel={() => setEditing(null)} />
      ) : (
        <button className="btn-ghost border border-edge text-sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {placeholder}
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
