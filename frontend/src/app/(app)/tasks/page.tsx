"use client";

// Tasks: today's list, the whole week, my points and history, create/manage, approvals.
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import TaskList from "@/components/TaskList";
import Leaderboard from "@/components/Leaderboard";
import TaskEditor, { NEW_TASK, TaskDraft } from "@/components/TaskEditor";
import {
  api,
  ApiError,
  ApprovalItem,
  LeaderboardEntry,
  Member,
  Task,
  TaskHistoryItem,
  TaskSuggestion,
  TodayTask,
  WeekDayTasks,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { toLocalDateKey } from "@/lib/dateKey";
import { scheduleLabel } from "@/lib/taskSchedule";
import { useMe } from "@/components/Shell";
import { NONE, setApiData, useApi } from "@/lib/query";
import PageTitle from "@/components/PageTitle";
import MedicineDoses from "@/components/safety/MedicineDoses";

export default function TasksPage() {
  const { t, dateLocale } = useI18n();
  const me = useMe();
  const [tab, setTab] = useState<"today" | "week" | "manage" | "approvals">("today");
  // Reporting afterwards (2.9.0): 0 = today, up to 3 days back.
  const [back, setBack] = useState(0);
  const reportDay = back ? toLocalDateKey(new Date(Date.now() - back * 86_400_000)) : undefined;
  const [showForm, setShowForm] = useState(false);
  // Suggestions: children propose tasks, adults turn them into tasks (or decline).
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState("");
  const [suggestDescription, setSuggestDescription] = useState("");
  const [suggestMsg, setSuggestMsg] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [manageError, setManageError] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // From the cache: every write below invalidates the tasks, and a live event from elsewhere in the
  // family does too – the lists refresh by themselves. Children don't ask for what is adults' only.
  const canManage = me?.role === "admin" || me?.role === "adult";
  const tasks = useApi<TodayTask[]>(`/api/tasks/today${back ? `?back=${back}` : ""}`).data ?? NONE;
  const week = useApi<WeekDayTasks[]>("/api/tasks/week").data ?? NONE;
  const suggestions = useApi<TaskSuggestion[]>("/api/tasks/suggestions").data ?? NONE;
  const history = useApi<TaskHistoryItem[]>("/api/tasks/history?days=30").data ?? NONE;
  const board = useApi<LeaderboardEntry[]>("/api/tasks/leaderboard").data ?? NONE;
  const members = useApi<Member[]>("/api/family/members").data ?? NONE;
  const manageTasks = useApi<Task[]>(canManage ? "/api/tasks/manage" : null).data ?? NONE;
  const approvals = useApi<ApprovalItem[]>(canManage ? "/api/tasks/approvals" : null).data ?? NONE;

  // Open a tab from the URL, e.g. /tasks?tab=approvals from the approval push or the dashboard banner.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "week" || wanted === "manage" || wanted === "approvals") setTab(wanted);
  }, []);

  async function createTask(draft: TaskDraft) {
    setError("");
    try {
      try {
        await api.post("/api/tasks", draft);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409 && confirm(t("tasks.duplicateConfirm")))) throw e;
        await api.post("/api/tasks?force=true", draft);
      }
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tasks.createError"));
    }
  }

  async function updateTask(taskId: string, patch: Partial<Task>) {
    try {
      await api.patch(`/api/tasks/${taskId}`, patch);
      setEditingTaskId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("tasks.updateError"));
    }
  }

  async function removeTask(taskId: string) {
    setManageError("");
    try {
      await api.del(`/api/tasks/${taskId}`);
      setApiData<Task[]>("/api/tasks/manage", (prev) => prev?.filter((task) => task.id !== taskId));
    } catch (e) {
      setManageError(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function suggest() {
    await api.post("/api/tasks/suggestions", { title: suggestTitle.trim(), description: suggestDescription.trim() || null });
    setSuggestTitle("");
    setSuggestDescription("");
    setShowSuggest(false);
    setSuggestMsg(t("suggest.sent"));
  }

  async function approveSuggestion(id: string, draft: TaskDraft) {
    try {
      await api.post(`/api/tasks/suggestions/${id}/approve`, draft);
      setApprovingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("common.error"));
    }
  }

  async function rejectSuggestion(id: string) {
    const note = prompt(t("suggest.rejectNotePrompt"));
    if (note === null) return;
    await api.post(`/api/tasks/suggestions/${id}/reject`, { note: note || null });
  }

  async function review(completionId: string, action: "approve" | "reject") {
    const note = action === "reject" ? prompt(t("tasks.rejectionNotePrompt")) || "" : "";
    await api.post(`/api/tasks/approvals/${completionId}`, { action, note: note || null });
  }

  useEffect(() => {
    // Wait for "me", or a link to ?tab=approvals is reset before we know the user is an adult.
    if (me && !canManage && (tab === "manage" || tab === "approvals")) setTab("today");
  }, [me, canManage, tab]);

  const myEntry = board.find((entry) => entry.user_id === me?.id);
  const todayKey = toLocalDateKey(new Date());
  const tabClass = (id: typeof tab) => `rounded px-3 py-1.5 ${tab === id ? "bg-base font-semibold" : "text-muted"}`;

  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle title={t("tasks.title")} />
        {canManage ? (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/tasks/little" className="btn-ghost border border-edge">
              🧸 {t("easy.title")}
            </Link>
            <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t("common.cancel") : t("tasks.new")}
            </button>
          </span>
        ) : me ? (
          <button className="btn-primary" onClick={() => setShowSuggest((v) => !v)}>
            {showSuggest ? t("common.cancel") : t("suggest.button")}
          </button>
        ) : null}
      </div>

      {showSuggest && !canManage && (
        <form
          className="card mt-4 space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            suggest();
          }}
        >
          <p className="text-sm text-muted">{t("suggest.intro")}</p>
          <div>
            <label className="label">{t("tasks.what")}</label>
            <input className="input" value={suggestTitle} onChange={(e) => setSuggestTitle(e.target.value)} maxLength={200} placeholder={t("suggest.titlePh")} />
          </div>
          <div>
            <label className="label">{t("tasks.description")}</label>
            <textarea className="input min-h-16" value={suggestDescription} onChange={(e) => setSuggestDescription(e.target.value)} maxLength={2000} />
          </div>
          <button className="btn-accent" type="submit" disabled={!suggestTitle.trim()}>{t("suggest.send")}</button>
        </form>
      )}
      {suggestMsg && <p className="mt-3 text-sm text-green-700">{suggestMsg}</p>}

      <div className="mt-4 inline-flex flex-wrap rounded-lg border border-edge bg-surface p-1 text-sm">
        <button className={tabClass("today")} onClick={() => setTab("today")}>{t("nav.today")}</button>
        <button className={tabClass("week")} onClick={() => setTab("week")}>{t("tasks.weekTab")}</button>
        {canManage && (
          <>
            <button className={tabClass("manage")} onClick={() => setTab("manage")}>{t("tasks.manageTab")}</button>
            <button className={tabClass("approvals")} onClick={() => setTab("approvals")}>
              {t("tasks.approvalsTab")} {approvals.length + suggestions.length > 0 ? <span className="ml-1 rounded bg-accent px-1.5 text-xs text-white">{approvals.length + suggestions.length}</span> : null}
            </button>
          </>
        )}
      </div>

      {showForm && canManage && (
        <div className="mt-4">
          <TaskEditor task={NEW_TASK} members={members} saveLabel={t("tasks.save")} onSave={createTask} onCancel={() => setShowForm(false)} />
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      )}

      {tab === "today" && (
        <>
          <MedicineDoses />
          {!canManage && suggestions.length > 0 && (
            <section className="card mt-4 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("suggest.mine")}</h2>
              <ul className="space-y-2">
                {suggestions.map((sug) => (
                  <li key={sug.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{sug.title}</span>
                      {sug.review_note && <span className="block text-xs text-muted">{sug.review_note}</span>}
                    </span>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                        sug.status === "approved" ? "bg-green-100 text-green-800" : sug.status === "rejected" ? "bg-edge text-muted" : "bg-accent-soft text-ink"
                      }`}
                    >
                      {t(sug.status === "approved" ? "suggest.statusApproved" : sug.status === "rejected" ? "suggest.statusRejected" : "suggest.statusPending")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <div className="mb-3 flex items-center gap-1">
                <button className="btn-ghost px-1.5 py-1" disabled={back >= 3} onClick={() => setBack(back + 1)} aria-label={t("tasks.dayBefore")}>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <h2 className="min-w-28 text-center text-sm font-bold uppercase tracking-wide text-muted">
                  {back === 0
                    ? t("nav.today")
                    : back === 1
                      ? t("tasks.yesterday")
                      : new Date(`${reportDay}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
                </h2>
                <button className="btn-ghost px-1.5 py-1" disabled={back === 0} onClick={() => setBack(back - 1)} aria-label={t("tasks.dayAfter")}>
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {back > 0 && <p className="mb-3 text-xs text-muted">{t("tasks.reportHint")}</p>}
              <TaskList items={tasks} members={members} meId={me?.id ?? null} back={back} />
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("widget.leaderboard")}</h2>
              <Leaderboard entries={board} />
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("tasks.myPoints")}</h2>
              <div className="flex gap-6">
                <div>
                  <div className="text-2xl font-extrabold">{myEntry?.points_total ?? 0}</div>
                  <div className="text-xs text-muted">{t("tasks.pointsTotal")}</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold">{myEntry?.points_week ?? 0}</div>
                  <div className="text-xs text-muted">{t("tasks.pointsWeek")}</div>
                </div>
              </div>
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("tasks.historyTitle")}</h2>
              {history.length === 0 ? (
                <p className="text-sm text-muted">{t("tasks.historyEmpty")}</p>
              ) : (
                <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {history.map((h, i) => (
                    <li key={`${h.task_id}-${h.completed_date}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.title}</span>
                        <span className="text-xs capitalize text-muted">
                          {new Date(`${h.completed_date}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" })}
                          {h.status === "pending" ? ` · ${t("tasks.waitingApproval")}` : h.status === "rejected" ? ` · ${t("tasks.rejected")}` : ""}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-semibold">
                        +{h.points_awarded}
                        <Star className="h-3.5 w-3.5 fill-accent text-accent" strokeWidth={2} aria-hidden />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {tab === "week" && (
        <div className="mt-4 space-y-3">
          {week.map(({ day, items }) => {
            const isToday = day === todayKey;
            return (
              <section key={day} className={`card p-4 ${isToday ? "ring-2 ring-accent" : ""}`}>
                <h2 className="mb-2 text-sm font-bold capitalize">
                  {new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" })}
                  {isToday && <span className="ml-2 rounded bg-accent-soft px-2 py-0.5 text-xs">{t("calendar.today")}</span>}
                </h2>
                {items.length === 0 ? (
                  <p className="text-xs text-muted">—</p>
                ) : (
                  <TaskList items={items} members={members} meId={me?.id ?? null} readOnly={!isToday} />
                )}
              </section>
            );
          })}
        </div>
      )}

      {tab === "manage" && canManage && (
        <div className="mt-4 space-y-4">
          <section className="card overflow-auto p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("tasks.manageTab")}</h2>
            {manageError && <p className="mb-3 text-sm text-red-700">{manageError}</p>}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">{t("tasks.what")}</th>
                  <th className="py-2 pr-4">{t("tasks.recurrence")}</th>
                  <th className="py-2 pr-4">{t("tasks.who")}</th>
                  <th className="py-2 pr-4">{t("tasks.points")}</th>
                  <th className="py-2 pr-4">{t("tasks.active")}</th>
                  <th className="py-2">{t("tasks.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {manageTasks.map((task) => {
                  const assigneeName = members.find((m) => m.id === task.assignee_id)?.display_name || t("tasks.anyone");
                  return (
                    <Fragment key={task.id}>
                      <tr className={`border-t border-edge ${task.active ? "" : "opacity-60"}`}>
                        <td className="py-2 pr-4">{task.title}</td>
                        <td className="py-2 pr-4">{scheduleLabel(task, t, dateLocale)}</td>
                        <td className="py-2 pr-4">{assigneeName}</td>
                        <td className="py-2 pr-4">{task.points}</td>
                        <td className="py-2 pr-4">
                          <input type="checkbox" checked={task.active} onChange={(e) => updateTask(task.id, { active: e.target.checked })} className="h-4 w-4 accent-primary-700" />
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button className="rounded border border-edge px-2 py-1 text-xs" onClick={() => setEditingTaskId(editingTaskId === task.id ? null : task.id)}>{t("tasks.edit")}</button>
                            <button
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                              onClick={() => removeTask(task.id)}
                              title={t("common.remove")}
                            >
                              {t("common.remove")}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingTaskId === task.id && (
                        <tr>
                          <td colSpan={6} className="pb-3">
                            <TaskEditor
                              task={task}
                              members={members}
                              saveLabel={t("tasks.saveChanges")}
                              onSave={(draft) => updateTask(task.id, draft)}
                              onCancel={() => setEditingTaskId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>

        </div>
      )}

      {tab === "approvals" && canManage && suggestions.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("suggest.adultTitle")}</h2>
          <ul className="space-y-3">
            {suggestions.map((sug) => (
              <li key={sug.id} className="rounded border border-edge p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{sug.title}</div>
                    <div className="text-xs text-muted">{t("suggest.from", { name: sug.user_name })}</div>
                    {sug.description && <p className="mt-1 whitespace-pre-line text-sm">{sug.description}</p>}
                  </div>
                  {approvingId !== sug.id && (
                    <div className="flex gap-2">
                      <button className="rounded border border-edge px-2 py-1 text-xs" onClick={() => setApprovingId(sug.id)}>{t("suggest.approve")}</button>
                      <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => rejectSuggestion(sug.id)}>{t("suggest.reject")}</button>
                    </div>
                  )}
                </div>
                {approvingId === sug.id && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-muted">{t("suggest.approveHint")}</p>
                    <TaskEditor
                      task={{ ...NEW_TASK, title: sug.title, description: sug.description, recurrence: "none", assignee_id: sug.user_id }}
                      members={members}
                      saveLabel={t("suggest.createTask")}
                      onSave={(draft) => approveSuggestion(sug.id, draft)}
                      onCancel={() => setApprovingId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "approvals" && canManage && (
        <section className="card mt-4 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("tasks.approvalsTab")}</h2>
          {approvals.length === 0 ? (
            <p className="text-sm text-muted">{t("tasks.noApprovals")}</p>
          ) : (
            <ul className="space-y-2">
              {approvals.map((item) => (
                <li key={item.completion_id} className="flex items-center justify-between rounded border border-edge p-3">
                  <div>
                    <div className="text-sm font-semibold">{item.task_title}</div>
                    <div className="text-xs text-muted">{item.user_name} · {item.points}p</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded border border-edge px-2 py-1 text-xs" onClick={() => review(item.completion_id, "approve")}>{t("tasks.approve")}</button>
                    <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => review(item.completion_id, "reject")}>{t("tasks.reject")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
