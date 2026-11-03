"use client";

// Task form, used both for new tasks and for editing (title, schedule, who – or members taking
// turns – points, approval).
import { useState } from "react";
import { isoDate, Member, Task } from "@/lib/api";
import { TranslationKey, useI18n } from "@/lib/i18n";
import { monthNames, taskWeekdays, weekdayNames } from "@/lib/taskSchedule";

type Recurrence = Task["recurrence"];

export type TaskDraft = Pick<
  Task,
  | "title"
  | "description"
  | "points"
  | "recurrence"
  | "weekday"
  | "weekdays"
  | "interval_weeks"
  | "interval_days"
  | "interval_months"
  | "month_nth"
  | "month"
  | "day_of_month"
  | "due_date"
  | "assignee_id"
  | "requires_approval"
  | "shared"
  | "rotation_user_ids"
  | "rotation_mode"
>;

export const NEW_TASK: TaskDraft = {
  title: "",
  description: null,
  points: 10,
  recurrence: "daily",
  weekday: null,
  weekdays: [],
  interval_weeks: 1,
  interval_days: 1,
  interval_months: 1,
  month_nth: null,
  month: null,
  day_of_month: null,
  due_date: null,
  assignee_id: null,
  requires_approval: false,
  shared: false,
  rotation_user_ids: [],
  rotation_mode: "done",
};

export default function TaskEditor({
  task,
  members,
  saveLabel,
  onSave,
  onCancel,
}: {
  task: TaskDraft;
  members: Member[];
  saveLabel: string;
  onSave: (draft: TaskDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, dateLocale } = useI18n();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [points, setPoints] = useState(task.points);
  const [recurrence, setRecurrence] = useState<Recurrence>(task.recurrence);
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    const days = taskWeekdays(task);
    return days.length > 0 ? days : [(new Date().getDay() + 6) % 7];
  });
  const [intervalWeeks, setIntervalWeeks] = useState(task.interval_weeks || 1);
  const [intervalDays, setIntervalDays] = useState(task.interval_days || 1);
  const [intervalMonths, setIntervalMonths] = useState(task.interval_months || 1);
  // Monthly on a date (0) or on the first … fourth / last (-1) weekday.
  const [monthNth, setMonthNth] = useState(task.month_nth ?? 0);
  const [month, setMonth] = useState(task.month ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(task.day_of_month ?? 1);
  const [dueDate, setDueDate] = useState(task.due_date ?? isoDate(new Date()));
  const [assignee, setAssignee] = useState(task.assignee_id ?? "");
  const [requiresApproval, setRequiresApproval] = useState(task.requires_approval);
  const [shared, setShared] = useState(!!task.shared);
  // Taking turns: members in the order they were picked.
  const [turns, setTurns] = useState<string[]>(task.rotation_user_ids ?? []);
  const [rotating, setRotating] = useState((task.rotation_user_ids ?? []).length >= 2);
  const [rotationMode, setRotationMode] = useState<"done" | "weekly">(task.rotation_mode ?? "done");
  const [saving, setSaving] = useState(false);

  function toggleWeekday(day: number) {
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()));
  }

  const monthWeekday = recurrence === "monthly" && monthNth !== 0;

  async function save() {
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        points,
        recurrence,
        weekday: recurrence === "weekly" || monthWeekday ? weekdays[0] : null,
        weekdays: recurrence === "weekly" ? weekdays : monthWeekday ? weekdays.slice(0, 1) : [],
        interval_weeks: recurrence === "weekly" ? intervalWeeks : 1,
        interval_days: recurrence === "daily" ? intervalDays : 1,
        interval_months: recurrence === "monthly" ? intervalMonths : 1,
        month_nth: monthWeekday ? monthNth : null,
        month: recurrence === "yearly" ? month : null,
        day_of_month: recurrence === "yearly" || (recurrence === "monthly" && !monthWeekday) ? dayOfMonth : null,
        due_date: recurrence === "none" ? dueDate : null,
        assignee_id: rotating ? turns[0] ?? null : assignee || null,
        requires_approval: requiresApproval,
        shared,
        rotation_user_ids: rotating ? turns : [],
        rotation_mode: rotationMode,
      });
    } finally {
      setSaving(false);
    }
  }

  const invalid = !title.trim() || (recurrence === "weekly" && weekdays.length === 0) || (rotating && turns.length < 2);
  const toggleTurn = (id: string) => setTurns((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <div className="space-y-3 rounded-lg border border-edge bg-base p-4">
      <div>
        <label className="label">{t("tasks.what")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t("tasks.whatPh")} aria-label={t("tasks.what")} />
      </div>
      <div>
        <label className="label">{t("tasks.description")}</label>
        <textarea className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} aria-label={t("tasks.description")} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="label">{t("tasks.points")}</label>
          <input className="input" type="number" min={1} max={1000} value={points} onChange={(e) => setPoints(Number(e.target.value))} aria-label={t("tasks.points")} />
        </div>
        <div>
          <label className="label">{t("tasks.recurrence")}</label>
          <select className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} aria-label={t("tasks.recurrence")}>
            <option value="daily">{t("tasks.daily")}</option>
            <option value="weekly">{t("tasks.weekly")}</option>
            <option value="monthly">{t("tasks.monthly")}</option>
            <option value="yearly">{t("tasks.yearly")}</option>
            <option value="none">{t("tasks.once")}</option>
          </select>
        </div>
        {recurrence === "daily" && (
          <div>
            <label className="label">{t("tasks.interval")}</label>
            <select className="input" value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} aria-label={t("tasks.interval")}>
              <option value={1}>{t("tasks.everyDay")}</option>
              {[2, 3, 4, 5, 6, 7, 10, 14].map((n) => (
                <option key={n} value={n}>{t(n === 2 ? "tasks.everyOtherDay" : "tasks.everyNDays", { n })}</option>
              ))}
            </select>
          </div>
        )}
        {recurrence === "weekly" && (
          <div>
            <label className="label">{t("tasks.interval")}</label>
            <select className="input" value={intervalWeeks} onChange={(e) => setIntervalWeeks(Number(e.target.value))} aria-label={t("tasks.interval")}>
              <option value={1}>{t("tasks.everyWeek")}</option>
              {[2, 3, 4, 6, 8].map((n) => (
                <option key={n} value={n}>{t("tasks.everyNWeeks", { n })}</option>
              ))}
            </select>
          </div>
        )}
        {recurrence === "monthly" && (
          <>
            <div>
              <label className="label">{t("tasks.interval")}</label>
              <select className="input" value={intervalMonths} onChange={(e) => setIntervalMonths(Number(e.target.value))} aria-label={t("tasks.interval")}>
                <option value={1}>{t("tasks.everyMonth")}</option>
                {[2, 3, 4, 6].map((n) => (
                  <option key={n} value={n}>{t("tasks.everyNMonths", { n })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("tasks.monthOn")}</label>
              <select className="input" value={monthNth} onChange={(e) => setMonthNth(Number(e.target.value))} aria-label={t("tasks.monthOn")}>
                <option value={0}>{t("tasks.monthOnDate")}</option>
                {[1, 2, 3, 4, -1].map((n) => (
                  <option key={n} value={n}>{t(`tasks.nth.${n}` as TranslationKey)}</option>
                ))}
              </select>
            </div>
            {monthWeekday ? (
              <div>
                <label className="label">{t("tasks.weekday")}</label>
                <select className="input capitalize" value={weekdays[0] ?? 5} onChange={(e) => setWeekdays([Number(e.target.value)])} aria-label={t("tasks.weekday")}>
                  {weekdayNames(dateLocale).map((name, day) => (
                    <option key={day} value={day}>{name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="label">{t("tasks.dayOfMonth")}</label>
                <input className="input" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} aria-label={t("tasks.dayOfMonth")} />
              </div>
            )}
          </>
        )}
        {recurrence === "yearly" && (
          <>
            <div>
              <label className="label">{t("tasks.month")}</label>
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthNames(dateLocale).map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("tasks.dayOfMonth")}</label>
              <input className="input" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} aria-label={t("tasks.dayOfMonth")} />
            </div>
          </>
        )}
        {recurrence === "none" && (
          <div>
            <label className="label">{t("tasks.date")}</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label={t("tasks.date")} />
          </div>
        )}
        <div>
          <label className="label">{t("tasks.who")}</label>
          {rotating ? (
            <p className="py-2 text-sm text-muted">{t("tasks.turnsWho")}</p>
          ) : (
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={t("tasks.who")}>
              <option value="">{t("tasks.anyone")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-edge p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={rotating} onChange={(e) => setRotating(e.target.checked)} />
          {t("tasks.takeTurns")}
        </label>
        {rotating && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted">{t("tasks.turnsHint")}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("tasks.takeTurns")}>
              {members.map((m) => {
                const at = turns.indexOf(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-sm ${at >= 0 ? "border-accent bg-accent-soft font-semibold" : "border-edge"}`}
                    onClick={() => toggleTurn(m.id)}
                    aria-pressed={at >= 0}
                  >
                    {at >= 0 ? `${at + 1}. ` : ""}
                    {m.display_name}
                  </button>
                );
              })}
            </div>
            <select className="input max-w-xs" value={rotationMode} onChange={(e) => setRotationMode(e.target.value as "done" | "weekly")} aria-label={t("tasks.turnsWhen")}>
              <option value="done">{t("tasks.turnsWhenDone")}</option>
              <option value="weekly">{t("tasks.turnsWeekly")}</option>
            </select>
          </div>
        )}
      </div>
      {recurrence === "weekly" && (
        <div>
          <span className="label">{t("tasks.weekdays")}</span>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <button type="button" className="rounded-full border border-edge px-3 py-1 hover:bg-surface" onClick={() => setWeekdays([0, 1, 2, 3, 4])}>{t("tasks.presetWeekdays")}</button>
            <button type="button" className="rounded-full border border-edge px-3 py-1 hover:bg-surface" onClick={() => setWeekdays([5, 6])}>{t("tasks.presetWeekend")}</button>
            <button type="button" className="rounded-full border border-edge px-3 py-1 hover:bg-surface" onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}>{t("tasks.presetAllWeek")}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {weekdayNames(dateLocale, "short").map((name, day) => {
              const on = weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWeekday(day)}
                  className={`min-h-10 min-w-12 rounded-full border px-3 text-sm capitalize ${
                    on ? "border-accent bg-accent-soft font-semibold text-ink" : "border-edge text-muted"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {recurrence === "monthly" && !monthWeekday && <p className="text-xs text-muted">{t("tasks.monthlyHint")}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary-700" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
        {t("tasks.requiresApproval")}
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-700" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <span>
          {t("tasks.sharedLabel")}
          <span className="block text-xs text-muted">{t("tasks.sharedHint")}</span>
        </span>
      </label>
      <div className="flex gap-2">
        <button className="btn-accent" onClick={save} disabled={invalid || saving}>{saveLabel}</button>
        <button className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
