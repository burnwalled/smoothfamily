"use client";

import { useState } from "react";
import Link from "next/link";
import { api, Member, TodayTask } from "@/lib/api";
import { useMe } from "@/components/Shell";
import WhoDidIt from "@/components/tasks/WhoDidIt";
import { useI18n } from "@/lib/i18n";
import { scheduleLabel } from "@/lib/taskSchedule";
import { CloudOff, CircleCheck, Repeat, Star, Trophy, Users } from "lucide-react";
import Confetti from "@/components/Confetti";

export default function TaskList({
  items,
  onChanged,
  members = [],
  meId = null,
  readOnly = false,
  back = 0,
}: {
  items: TodayTask[];
  onChanged: () => void;
  // Used to show who a task is for; tasks for someone else can't be completed by me.
  members?: Member[];
  meId?: string | null;
  // Other days in the week view: show status only.
  readOnly?: boolean;
  // Reporting afterwards (2.9.0): how many days back the tasks are ticked off for.
  back?: number;
}) {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const adult = me.role === "admin" || me.role === "adult";
  const [showConfetti, setShowConfetti] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // Shown as done the moment it's tapped (#99); undone again if the server says no.
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  // A task done together: who did it with you (3.0.3).
  const [together, setTogether] = useState<TodayTask["task"] | null>(null);

  async function complete(taskId: string, others: string[] = []) {
    setTicked((prev) => new Set(prev).add(`${back}:${taskId}`));
    try {
      const result = await api.post<TodayTask>(`/api/tasks/${taskId}/complete${back ? `?back=${back}` : ""}`, others.length ? { together: others } : undefined);
      if (result.unlocked && result.unlocked.length > 0) {
        setShowConfetti(true);
        setToastMsg(t("achievements.newUnlock"));
        setTimeout(() => {
          setShowConfetti(false);
          setToastMsg(null);
        }, 4000);
      }
      onChanged();
    } catch (e) {
      setTicked((prev) => {
        const next = new Set(prev);
        next.delete(`${back}:${taskId}`);
        return next;
      });
      alert(e instanceof Error ? e.message : t("tasks.completeError"));
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">{t("tasks.none")}</p>;
  }

  return (
    <>
      <Confetti show={showConfetti} />
      {toastMsg && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg">
          <Trophy className="mr-2 inline h-4 w-4 align-[-3px]" strokeWidth={2} aria-hidden />
          {toastMsg}
        </div>
      )}
      <ul className="space-y-2">
        {items.map(({ task, done: doneOnServer, done_by, completion_status, review_note, pending }) => {
          const done = doneOnServer || (ticked.has(`${back}:${task.id}`) && completion_status !== "pending");
          const assignee = members.find((m) => m.id === task.assignee_id);
          // An adult may give a child's dose of medicine (the points are still the child's).
          const forSomeoneElse = task.assignee_id !== null && meId !== null && task.assignee_id !== meId && !(task.medication_id && adult);
          // Taking turns: who comes after the one whose turn it is.
          const turns = task.rotation_user_ids ?? [];
          const nextId = turns.length >= 2 && task.assignee_id ? turns[(turns.indexOf(task.assignee_id) + 1) % turns.length] : null;
          const next = nextId ? members.find((m) => m.id === nextId) : null;
          return (
            <li
              key={task.id}
              className={`flex items-center justify-between gap-3 rounded-lg border border-edge px-3 py-2 ${
                done ? "bg-base opacity-70" : "bg-surface"
              }`}
            >
              <div className="min-w-0">
                <div className={`flex items-center gap-1.5 text-sm font-semibold ${done ? "line-through" : ""}`}>
                  {task.title}
                  {pending && <CloudOff className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-label={t("offline.notSynced")} />}
                </div>
                {task.event_key && task.description && !done && <p className="whitespace-pre-line text-xs text-muted">{task.description}</p>}
                {task.trip_id && !done && (
                  <Link href={`/trips?trip=${task.trip_id}`} className="text-xs text-accent hover:underline">{t("packDay.openList")}</Link>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {members.length > 0 && (
                    assignee ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-edge px-2 leading-5 text-ink">
                        <span className="h-2 w-2 rounded-full" style={{ background: assignee.color }} aria-hidden />
                        {turns.length >= 2 && <Repeat className="h-3 w-3" strokeWidth={2} aria-label={t("tasks.takeTurns")} />}
                        {assignee.display_name}
                        {next && <span className="text-muted">· {t("tasks.thenNext", { name: next.display_name })}</span>}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-edge px-2 leading-5">
                        <Users className="h-3 w-3" strokeWidth={2} aria-hidden />
                        {t("tasks.anyone")}
                      </span>
                    )
                  )}
                  <span>
                    {completion_status === "pending"
                      ? t("tasks.waitingApproval")
                      : completion_status === "rejected"
                        ? `${t("tasks.rejected")}${review_note ? `: ${review_note}` : ""}`
                        : done && done_by
                          ? t("tasks.doneBy", { name: done_by })
                          : scheduleLabel(task, t, dateLocale)}
                  </span>
                </div>
              </div>
              {done ? (
                <CircleCheck className="h-6 w-6 shrink-0 text-accent" strokeWidth={2} aria-hidden />
              ) : completion_status === "pending" ? (
                <span className="shrink-0 rounded border border-edge px-2 py-1 text-xs text-muted">{t("tasks.waitingApproval")}</span>
              ) : readOnly || forSomeoneElse ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                  {task.points}
                  <Star className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
              ) : (
                <button className="btn-accent min-h-10 shrink-0 px-3 py-1 text-xs" onClick={() => (task.shared && members.length > 1 && meId ? setTogether(task) : complete(task.id))}>
                  <span className="inline-flex items-center gap-1">
                    {t("tasks.complete", { points: task.points })}
                    <Star className="h-3.5 w-3.5 fill-current" strokeWidth={2} aria-hidden />
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {together && meId && (
        <WhoDidIt
          title={together.title}
          points={together.points}
          shared
          people={members.map((m) => ({ id: m.id, name: m.display_name, color: m.color }))}
          first={meId}
          onDone={(ids) => complete(together.id, ids.filter((id) => id !== meId))}
          onClose={() => setTogether(null)}
        />
      )}
    </>
  );
}
