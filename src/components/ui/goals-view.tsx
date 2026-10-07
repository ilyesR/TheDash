"use client";

import * as React from "react";
import {
  Menu,
  Loader2,
  Plus,
  X,
  Check,
  Target,
  Trash2,
  Send,
  Pencil,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  CalendarRange,
  List,
  LayoutGrid,
} from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import { cn } from "@/lib/utils";
import { useGoalLayout } from "@/lib/use-goal-layout";
import type { Goal } from "@/lib/goal";
import {
  addDays,
  allowedSkips,
  band,
  boxesFor,
  cleanStreak,
  countInWeek,
  dayRate,
  DEFAULT_THRESHOLDS,
  effectiveStart,
  formatRate,
  liveOn,
  pastWeekRates,
  skipsLeft,
  today,
  weekDays,
  weekPoints,
  weekRate,
  weekStart,
} from "@/lib/goal";
import type { Thresholds } from "@/lib/goal";

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

/** How much history the calendars show. */
const WEEKS_BACK = 12;

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function GoalsView() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Goal | "new" | null>(null);

  const now = today();

  /** The day being ticked. Defaults to today, but any past day can be fixed up. */
  const [selected, setSelected] = React.useState(now);
  const [thresholds, setThresholds] = React.useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [tuning, setTuning] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [goalsRes, settingsRes] = await Promise.all([
          fetch("/api/goals"),
          fetch("/api/settings"),
        ]);
        const payload = await goalsRes.json();
        if (!goalsRes.ok) throw new Error(payload?.error ?? "Could not load your goals.");

        const settings = await settingsRes.json().catch(() => null);
        if (!cancelled) {
          setGoals(payload.goals as Goal[]);
          // Falling back to the defaults keeps the calendars readable even if
          // the settings document is missing.
          if (settingsRes.ok && settings?.thresholds) setThresholds(settings.thresholds);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your goals.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Set to one goal's id to read the calendars for that goal alone. */
  const [focus, setFocus] = React.useState<string | null>(null);

  /** Only published goals are tracked; drafts stay out of the calendars. */
  const published = React.useMemo(() => goals.filter((g) => g.published), [goals]);

  // A goal you deleted or unpublished must not keep the calendars to itself.
  const only = React.useMemo(
    () => published.find((g) => g.id === focus) ?? null,
    [published, focus]
  );
  const tracked = only ? [only] : published;
  const drafts = React.useMemo(() => goals.filter((g) => !g.published), [goals]);

  async function toggleDay(goal: Goal) {
    const done = !goal.checkIns.includes(selected);
    setBusy(goal.id);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goal.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selected, done }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
      setGoals((list) => list.map((g) => (g.id === goal.id ? (payload.goal as Goal) : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function publish(goal: Goal) {
    setBusy(goal.id);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...goal, published: true }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not publish.");
      setGoals((list) => list.map((g) => (g.id === goal.id ? (payload.goal as Goal) : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(goal: Goal) {
    const previous = goals;
    setGoals((list) => list.filter((g) => g.id !== goal.id));
    try {
      const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setGoals(previous);
      setError("Could not delete that goal.");
    }
  }

  return (
    <div className="relative flex min-h-screen bg-neutral-950 text-white">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-white/70 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Goals</h1>
              <p className="text-[12px] text-white/45">
                Tick what you did today, and see the weeks you held the line.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTuning((v) => !v)}
              aria-expanded={tuning}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white/60 transition-colors hover:text-white"
            >
              <SlidersHorizontal size={15} />
              <span className="hidden sm:inline">Thresholds</span>
            </button>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">New goal</span>
            </button>
          </div>
        </header>

        <main className="flex flex-col gap-4 px-6 pb-10">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300"
            >
              {error}
            </p>
          )}

          {tuning && (
            <ThresholdsPanel
              thresholds={thresholds}
              onChange={setThresholds}
              onError={setError}
            />
          )}

          {loading ? (
            <p className="flex items-center gap-2 py-10 text-[13px] text-white/40">
              <Loader2 size={15} className="animate-spin" />
              Loading…
            </p>
          ) : goals.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16 text-center">
              <Target size={22} className="mb-3 text-white/25" />
              <p className="text-[13px] text-white/50">No goal yet.</p>
              <p className="mt-1 max-w-[340px] text-[12px] text-white/30">
                Add one, say how many times a week you want to hit it, set your rules,
                then publish it to start tracking.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="flex min-w-0 flex-col gap-4">
              <DayPanel
                // Only what was actually running that day is tickable: a goal
                // set to start next Monday has nothing to say about today.
                goals={liveOn(published, selected)}
                pending={published.length - liveOn(published, selected).length}
                focus={focus}
                onFocus={(goal) =>
                  setFocus((current) => (current === goal.id ? null : goal.id))
                }
                date={selected}
                today={now}
                busy={busy}
                onToggle={toggleDay}
                onEdit={setEditing}
                onDelete={remove}
                onDateChange={setSelected}
              />

              {drafts.length > 0 && (
                <DraftsPanel
                  drafts={drafts}
                  busy={busy}
                  onPublish={publish}
                  onEdit={setEditing}
                  onDelete={remove}
                />
              )}

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <DailyCalendar
                  goals={tracked}
                  only={only}
                  onClearOnly={() => setFocus(null)}
                  today={now}
                  selected={selected}
                  onSelect={setSelected}
                  thresholds={thresholds}
                />
                <WeeklyCalendar goals={tracked} today={now} thresholds={thresholds} />
              </div>
              </div>

              <div className="xl:sticky xl:top-4">
                <StatsPanel
                  goals={tracked}
                  only={only}
                  today={now}
                  thresholds={thresholds}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {editing && (
        <GoalDialog
          goal={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(goal) =>
            setGoals((list) => {
              const exists = list.some((g) => g.id === goal.id);
              return exists ? list.map((g) => (g.id === goal.id ? goal : g)) : [...list, goal];
            })
          }
        />
      )}
    </div>
  );
}

/**
 * How many days of this week you can still miss this goal without owing
 * anything. The day being viewed is not spent yet, so it never counts itself.
 */
function SkipsChip({ goal, date }: { goal: Goal; date: string }) {
  const allowed = allowedSkips(goal, date);
  const left = skipsLeft(goal, date);

  const [text, tone] =
    allowed === 0
      ? ["every day", "border-neutral-700 bg-neutral-900 text-white/45"]
      : left > 0
        ? [
            `${left} off day${left === 1 ? "" : "s"} left`,
            "border-neutral-700 bg-neutral-900 text-white/55",
          ]
        : left === 0
          ? ["no off days left", "border-amber-500/30 bg-amber-500/10 text-amber-300"]
          : [
              `${-left} missed`,
              "border-red-500/30 bg-red-500/10 text-red-300",
            ];

  return (
    <span
      title={`${goal.timesPerWeek}× a week — ${allowed} off day${allowed === 1 ? "" : "s"} allowed`}
      className={cn("rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums", tone)}
    >
      {text}
    </span>
  );
}

function DayPanel({
  goals,
  pending,
  date: now,
  today: realToday,
  busy,
  focus,
  onFocus,
  onToggle,
  onEdit,
  onDelete,
  onDateChange,
}: {
  goals: Goal[];
  /** Published goals not running on this day, so the list cannot look empty. */
  pending: number;
  date: string;
  today: string;
  busy: string | null;
  /** Id of the goal the calendars are following, if any. */
  focus: string | null;
  onFocus: (g: Goal) => void;
  onToggle: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
  onDateChange: (next: string) => void;
}) {
  const { layout, setLayout } = useGoalLayout();
  const allDone = goals.length > 0 && goals.every((g) => g.checkIns.includes(now));
  const isToday = now === realToday;

  const heading = isToday
    ? "Today"
    : new Date(`${now}T00:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDateChange(addDays(now, -1))}
            aria-label="Previous day"
            className="rounded-md p-1 text-white/45 transition-colors hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>

          <h2 className="min-w-[150px] text-center text-sm font-semibold text-white">
            {heading}
          </h2>

          <button
            type="button"
            onClick={() => onDateChange(addDays(now, 1))}
            // Ticking a day that has not happened yet would be a lie.
            disabled={isToday}
            aria-label="Next day"
            className="rounded-md p-1 text-white/45 transition-colors hover:text-white disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>

          {!isToday && (
            <button
              type="button"
              onClick={() => onDateChange(realToday)}
              className="ml-1 rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-white/60 transition-colors hover:text-white"
            >
              Back to today
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/70 p-0.5">
            {(
              [
                { key: "list" as const, Icon: List, label: "List view" },
                { key: "cards" as const, Icon: LayoutGrid, label: "Card view" },
              ]
            ).map(({ key, Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLayout(key)}
                aria-pressed={layout === key}
                aria-label={label}
                title={label}
                className={cn(
                  "rounded-md px-2 py-1.5 transition-colors",
                  layout === key
                    ? "bg-neutral-800 text-white"
                    : "text-white/40 hover:text-white"
                )}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          <span
            className={cn(
              "rounded-md border px-2 py-1 text-[11px]",
              allDone
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-neutral-700 text-white/45"
            )}
          >
            {goals.filter((g) => g.checkIns.includes(now)).length} / {goals.length} ticked
          </span>
        </div>
      </div>

      {goals.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-white/35">
          {pending > 0
            ? `Nothing running on this day — ${pending} ${pending === 1 ? "goal starts" : "goals start"} later.`
            : "Nothing published yet — publish a goal to start ticking."}
        </p>
      ) : layout === "cards" ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => {
            const ticked = goal.checkIns.includes(now);

            return (
              <li key={goal.id} className="group relative">
                {/* The card body is the tick target; edit and delete sit
                    outside it, since a button cannot nest inside a button. */}
                <button
                  type="button"
                  onClick={() => onToggle(goal)}
                  disabled={busy !== null}
                  aria-pressed={ticked}
                  aria-label={`${ticked ? "Untick" : "Tick"} ${goal.title} for ${now}`}
                  className={cn(
                    "flex h-full w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                    ticked
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-600",
                    // The calendars are reading this one; say so on the card.
                    focus === goal.id && "ring-2 ring-white/60"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md border transition-colors",
                      ticked
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-neutral-700"
                    )}
                  >
                    {busy === goal.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : ticked ? (
                      <Check size={15} />
                    ) : null}
                  </span>

                  <span
                    className={cn(
                      "pr-12 text-[14px] font-medium leading-snug",
                      ticked ? "text-white/50 line-through" : "text-white"
                    )}
                  >
                    {goal.title}
                  </span>

                  <SkipsChip goal={goal} date={now} />

                  {goal.rules.length > 0 && (
                    <span className="mt-1 flex flex-col gap-0.5">
                      {goal.rules.map((rule, i) => (
                        <span key={i} className="text-[11px] text-white/40">
                          — {rule}
                        </span>
                      ))}
                    </span>
                  )}
                </button>

                <span className="absolute right-3 top-3 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFocus(goal)}
                    aria-pressed={focus === goal.id}
                    aria-label={
                      focus === goal.id
                        ? `Show all goals in the calendars`
                        : `Show only ${goal.title} in the calendars`
                    }
                    title={
                      focus === goal.id
                        ? "Calendars are showing this goal — click to show all"
                        : "Show this goal alone in the calendars"
                    }
                    className={cn(
                      "rounded-md p-1 transition-all",
                      focus === goal.id
                        ? "text-white opacity-100"
                        : "text-white/25 opacity-0 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                    )}
                  >
                    <CalendarRange size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(goal)}
                    aria-label={`Edit ${goal.title}`}
                    className="rounded-md p-1 text-white/25 opacity-0 transition-all hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(goal)}
                    aria-label={`Delete ${goal.title}`}
                    className="rounded-md p-1 text-white/25 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col">
          {goals.map((goal) => {
            const ticked = goal.checkIns.includes(now);

            return (
              <li
                key={goal.id}
                className="group flex items-start gap-3 border-b border-neutral-800/50 py-3 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => onToggle(goal)}
                  disabled={busy !== null}
                  aria-pressed={ticked}
                  aria-label={`${ticked ? "Untick" : "Tick"} ${goal.title} for ${now}`}
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-40",
                    ticked
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-neutral-700 hover:border-neutral-500"
                  )}
                >
                  {busy === goal.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : ticked ? (
                    <Check size={13} />
                  ) : null}
                </button>

                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-[14px]",
                        ticked ? "text-white/50 line-through" : "text-white"
                      )}
                    >
                      {goal.title}
                    </span>
                    <SkipsChip goal={goal} date={now} />
                  </span>

                  {goal.rules.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {goal.rules.map((rule, i) => (
                        <li key={i} className="text-[11px] text-white/40">
                          — {rule}
                        </li>
                      ))}
                    </ul>
                  )}
                </span>

                <span className="mt-0.5 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFocus(goal)}
                    aria-pressed={focus === goal.id}
                    aria-label={
                      focus === goal.id
                        ? `Show all goals in the calendars`
                        : `Show only ${goal.title} in the calendars`
                    }
                    title={
                      focus === goal.id
                        ? "Calendars are showing this goal — click to show all"
                        : "Show this goal alone in the calendars"
                    }
                    className={cn(
                      "rounded-md p-1 transition-all",
                      focus === goal.id
                        ? "text-white opacity-100"
                        : "text-white/25 opacity-0 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                    )}
                  >
                    <CalendarRange size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(goal)}
                    aria-label={`Edit ${goal.title}`}
                    className="rounded-md p-1 text-white/25 opacity-0 transition-all hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(goal)}
                    aria-label={`Delete ${goal.title}`}
                    className="rounded-md p-1 text-white/25 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {goals.length > 0 && pending > 0 && (
        <p className="mt-3 text-[11px] text-white/25">
          {pending} more {pending === 1 ? "goal was" : "goals were"} not running
          on this day.
        </p>
      )}
    </section>
  );
}

function DraftsPanel({
  drafts,
  busy,
  onPublish,
  onEdit,
  onDelete,
}: {
  drafts: Goal[];
  busy: string | null;
  onPublish: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  return (
    <section className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">Drafts</h2>
      <p className="mb-3 text-[11px] text-white/40">
        Not counted anywhere until you publish them.
      </p>

      <ul className="flex flex-col">
        {drafts.map((goal) => (
          <li
            key={goal.id}
            className="flex items-center gap-3 border-b border-neutral-800/50 py-2.5 last:border-0"
          >
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] text-white/80">{goal.title}</span>
              <span className="text-[11px] text-white/35">
                {goal.timesPerWeek}× per week
                {goal.rules.length > 0 &&
                  ` · ${goal.rules.length} rule${goal.rules.length === 1 ? "" : "s"}`}
              </span>
            </span>

            <button
              type="button"
              onClick={() => onEdit(goal)}
              aria-label={`Edit ${goal.title}`}
              className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:text-white"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(goal)}
              aria-label={`Delete ${goal.title}`}
              className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => onPublish(goal)}
              disabled={busy !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {busy === goal.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              Publish
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
      <span className="text-[10px] uppercase tracking-wide text-white/35">{label}</span>
      <span className={cn("text-[18px] font-semibold tabular-nums", tone ?? "text-white")}>
        {value}
      </span>
      {hint && <span className="text-[11px] text-white/35">{hint}</span>}
    </div>
  );
}

const TONE_TEXT = {
  green: "text-emerald-400",
  orange: "text-orange-400",
  red: "text-red-400",
} as const;

/**
 * The numbers behind the calendars. Follows the same goal the calendars do, so
 * focusing one never leaves a total here counting the others.
 */
function StatsPanel({
  goals,
  only,
  today: now,
  thresholds,
}: {
  goals: Goal[];
  only: Goal | null;
  today: string;
  thresholds: Thresholds;
}) {
  const { points, boxes } = weekPoints(goals, now);
  const rate = weekRate(goals, now);
  const streak = cleanStreak(goals, now);

  const past = pastWeekRates(goals, now, 4);
  const average =
    past.length === 0
      ? null
      : past.reduce((sum, r) => sum + r, 0) / past.length;

  const liveToday = liveOn(goals, now);
  const tickedToday = liveToday.filter((g) => g.checkIns.includes(now)).length;
  // The same figure the daily calendar quotes: excused skips leave the sum
  // rather than counting against you.
  const todayRate = dayRate(goals, now);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h2 className="text-sm font-semibold text-white">
        Stats{only && <span className="text-white/45"> · {only.title}</span>}
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Today"
          value={todayRate === null ? "—" : `${formatRate(todayRate)}%`}
          hint={
            todayRate === null
              ? "rest day"
              : `${tickedToday}/${liveToday.length} ticked, so far`
          }
        />
        <Stat
          label="Streak"
          value={String(streak)}
          hint={streak === 1 ? "day, no miss" : "days, no miss"}
          tone={streak > 0 ? "text-emerald-400" : undefined}
        />
        <Stat
          label="This week"
          value={rate === null ? "—" : `${formatRate(rate)}%`}
          hint={`${points}/${boxes} pts`}
          tone={
            rate === null
              ? undefined
              : TONE_TEXT[band(rate, thresholds.weekRed, thresholds.weekOrange)]
          }
        />
        <Stat
          label="Last 4 weeks"
          value={average === null ? "—" : `${formatRate(average)}%`}
          hint={
            past.length === 0
              ? "no finished week yet"
              : `over ${past.length} week${past.length === 1 ? "" : "s"}`
          }
          tone={
            average === null
              ? undefined
              : TONE_TEXT[band(average, thresholds.weekRed, thresholds.weekOrange)]
          }
        />
      </div>

      <div className="mt-1 flex flex-col gap-2">
        <span className="text-[11px] font-medium text-white/50">This week, per goal</span>
        {goals.map((goal) => {
          const done = countInWeek(goal, now);
          const target = boxesFor(goal, now);
          const hit = done >= target;

          return (
            <div key={goal.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-white/70">{goal.title}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] tabular-nums",
                    hit ? "text-emerald-400" : "text-white/40"
                  )}
                >
                  {Math.min(done, target)}/{target}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={cn("h-full rounded-full", hit ? "bg-emerald-500" : "bg-white/35")}
                  style={{
                    width: `${target === 0 ? 0 : Math.min(100, (done / target) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Exactly one background class per cell, so none can win over another. */
const CELL_FUTURE = "bg-neutral-800/40";
const CELL_NOT_RUNNING = "bg-black";

/**
 * One goal on its own: done or not, with nothing averaged. Today stays neutral
 * until ticked — it is not a failure while you can still do it.
 */
function oneGoalCell(goal: Goal, date: string, now: string) {
  if (date > now) return { bg: CELL_FUTURE, title: date };
  if (effectiveStart(goal) > date) {
    return { bg: CELL_NOT_RUNNING, title: `${date} — not started yet` };
  }
  if (goal.checkIns.includes(date)) {
    return { bg: "bg-emerald-500/70", title: `${date} — done` };
  }
  return date === now
    ? { bg: CELL_FUTURE, title: `${date} — not yet` }
    : { bg: "bg-red-500/60", title: `${date} — not done` };
}

/** Every goal at once: the day's completion rate against your thresholds. */
function allGoalsCell(
  goals: Goal[],
  date: string,
  now: string,
  thresholds: Thresholds
) {
  if (date > now) return { bg: CELL_FUTURE, title: date };

  // A day still running has not had its chance yet, so it carries no verdict.
  const over = date < now;
  const rate = dayRate(goals, date);

  if (rate === null) {
    // Owed nothing because every goal was resting, which is not the same as a
    // day before any goal existed.
    return liveOn(goals, date).length > 0
      ? { bg: "bg-neutral-600/50", title: `${date} — rest day, within your weekly skips` }
      : { bg: CELL_NOT_RUNNING, title: date };
  }

  const title = `${date} — ${formatRate(rate)}%${over ? " done" : " so far"}`;
  if (!over) return { bg: CELL_FUTURE, title };

  const tone = band(rate, thresholds.dayRed, thresholds.dayOrange);
  return {
    bg:
      tone === "green"
        ? "bg-emerald-500/70"
        : tone === "orange"
          ? "bg-orange-500/70"
          : "bg-red-500/60",
    title,
  };
}

/** Monday-first grid, oldest week at the top, one row per week. */
function DailyCalendar({
  goals,
  only,
  onClearOnly,
  today: now,
  selected,
  onSelect,
  thresholds,
}: {
  goals: Goal[];
  /** Set when you are looking at a single goal instead of all of them. */
  only: Goal | null;
  onClearOnly: () => void;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  thresholds: Thresholds;
}) {
  const weeks = React.useMemo(() => {
    const currentMonday = weekStart(now);
    return Array.from({ length: WEEKS_BACK }, (_, i) =>
      weekDays(addDays(currentMonday, (i - (WEEKS_BACK - 1)) * 7))
    );
  }, [now]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">
          Daily{only && <span className="text-white/45"> · {only.title}</span>}
        </h2>
        {only && (
          <button
            type="button"
            onClick={onClearOnly}
            className="rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-white/60 transition-colors hover:text-white"
          >
            Show all goals
          </button>
        )}
      </div>
      <p className="mb-4 text-[11px] text-white/40">
{only ? (
          <>
            Just <span className="text-white/70">{only.title}</span>: green the days
            you ticked it, red the days you did not. Today waits until you tick it,
            and black is before it started.
          </>
        ) : (
          <>
            Coloured by the share of what the day owed you that you delivered,
            against the thresholds you set. A goal set to 5×/week may be skipped
            twice before a miss counts — earlier skips leave the sum instead of
            dragging it down. Only finished days are scored; grey is a day that
            owed nothing, black a day before any goal existed. Click a day to fix
            it up.
          </>
        )}
      </p>

      <div className="flex flex-col gap-1">
        <div className="flex gap-1 pl-[52px]">
          {DAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="w-6 text-center text-[10px] text-white/25"
              aria-hidden="true"
            >
              {label}
            </span>
          ))}
        </div>

        {weeks.map((days) => (
          <div key={days[0]} className="flex items-center gap-1">
            <span className="w-[48px] shrink-0 text-right text-[10px] text-white/25">
              {days[0].slice(5)}
            </span>
            {days.map((date) => {
              const { bg, title } = only
                ? oneGoalCell(only, date, now)
                : allGoalsCell(goals, date, now, thresholds);

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelect(date)}
                  disabled={date > now}
                  title={title}
                  aria-label={`Show ${date}`}
                  className={cn(
                    "size-6 rounded transition-transform enabled:hover:scale-110",
                    bg,
                    date === now && "ring-1 ring-white/40",
                    date === selected && "ring-2 ring-white"
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function WeeklyCalendar({
  goals,
  today: now,
  thresholds,
}: {
  goals: Goal[];
  today: string;
  thresholds: Thresholds;
}) {
  const weeks = React.useMemo(() => {
    const currentMonday = weekStart(now);
    return Array.from({ length: WEEKS_BACK }, (_, i) =>
      addDays(currentMonday, (i - (WEEKS_BACK - 1)) * 7)
    );
  }, [now]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">Weekly</h2>
      <p className="mb-4 text-[11px] text-white/40">
        One point per box the week asks you to tick — gym 5× and no smoking 7×
        make twelve — coloured by the percentage once the week is over. A goal
        stops at its own target, so a sixth gym session cannot cover a missed
        one elsewhere.
      </p>

      <ul className="flex flex-col">
        {[...weeks].reverse().map((monday) => {
          // Same rule as the daily grid: the running week is still yours to
          // finish, so it gets no verdict until it is over.
          const over = monday < weekStart(now);
          const rate = weekRate(goals, monday);
          const tone =
            over && rate !== null
              ? band(rate, thresholds.weekRed, thresholds.weekOrange)
              : null;
          const { points, boxes } = weekPoints(goals, monday);

          return (
            <li
              key={monday}
              className="flex items-center gap-3 border-b border-neutral-800/40 py-2 last:border-0"
            >
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  tone === "green" && "bg-emerald-500",
                  tone === "orange" && "bg-orange-500",
                  tone === "red" && "bg-red-500/70",
                  tone === null && "bg-neutral-700"
                )}
              />
              <span className="text-[12px] text-white/70">
                Week of {monday}
                {monday === weekStart(now) && (
                  <span className="ml-2 text-[10px] text-amber-300">in progress</span>
                )}
              </span>
              <span className="ml-auto text-[11px] tabular-nums text-white/40">
                {rate === null ? "—" : `${formatRate(rate)}%`} · {points}/{boxes} pts
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GoalDialog({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSaved: (goal: Goal) => void;
}) {
  const [title, setTitle] = React.useState(goal?.title ?? "");
  const [timesPerWeek, setTimesPerWeek] = React.useState(goal?.timesPerWeek ?? 3);
  const [rules, setRules] = React.useState<string[]>(goal?.rules ?? []);
  const [rule, setRule] = React.useState("");
  // The exact day you pick, not the Monday of its week: nothing before it is
  // counted, so picking Tuesday must leave Monday alone.
  const [startedOn, setStartedOn] = React.useState(goal?.startedOn ?? today());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const titleRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => titleRef.current?.focus(), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addRule() {
    const trimmed = rule.trim();
    if (!trimmed) return;
    setRules((list) => [...list, trimmed]);
    setRule("");
  }

  async function submit(publishNow: boolean) {
    if (!title.trim()) {
      setError("A goal needs a title.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        timesPerWeek,
        rules,
        // Publishing is one-way here: an already published goal stays published.
        published: publishNow || (goal?.published ?? false),
        checkIns: goal?.checkIns ?? [],
        startedOn,
      };

      const res = await fetch(goal ? `/api/goals/${goal.id}` : "/api/goals", {
        method: goal ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save that goal.");

      onSaved(payload.goal as Goal);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-dialog-title"
        className="relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="goal-dialog-title" className="text-sm font-semibold text-white">
            {goal ? "Edit goal" : "New goal"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Goal</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Go to the gym, read, ship something…"
              maxLength={120}
              className={FIELD}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Times per week</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTimesPerWeek(n)}
                  aria-pressed={timesPerWeek === n}
                  className={cn(
                    "size-9 rounded-lg border text-[13px] tabular-nums transition-colors",
                    timesPerWeek === n
                      ? "border-white bg-white text-black"
                      : "border-neutral-700 text-white/60 hover:text-white"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Starts on</span>
            <input
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value || today())}
              className={cn(FIELD, "[color-scheme:dark]")}
            />
            <span className="text-[11px] text-white/30">
              {startedOn > today()
                ? "Set for later: it stays out of the scoring, and off the tick list, until that day."
                : startedOn < today()
                  ? "Backdated: the weeks since then are scored, the ones before are not."
                  : "Nothing before this day is counted. Its own week asks only for the days that were left, so starting mid-week is not a hole in it."}
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Rules (optional)</span>

            {rules.length > 0 && (
              <ul className="flex flex-col gap-1">
                {rules.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 text-[12px] text-white/75">{r}</span>
                    <button
                      type="button"
                      onClick={() => setRules((list) => list.filter((_, j) => j !== i))}
                      aria-label={`Remove rule "${r}"`}
                      className="shrink-0 rounded-md p-0.5 text-white/25 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-2">
              <input
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRule();
                  }
                }}
                placeholder="At least 45 minutes, before noon…"
                maxLength={300}
                aria-label="New rule"
                className={cn(FIELD, "flex-1 py-1.5 text-[12px]")}
              />
              <button
                type="button"
                onClick={addRule}
                disabled={rule.trim() === ""}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[12px] text-white/70 transition-colors hover:text-white disabled:opacity-40"
              >
                <Plus size={12} />
                Add
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
            >
              {error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-[13px] text-white/60 transition-colors hover:text-white"
            >
              Cancel
            </button>

            {!goal?.published && (
              <button
                type="button"
                onClick={() => void submit(false)}
                disabled={saving}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-[13px] text-white/70 transition-colors hover:text-white disabled:opacity-50"
              >
                Save as draft
              </button>
            )}

            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {goal?.published ? "Save" : "Publish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThresholdsPanel({
  thresholds,
  onChange,
  onError,
}: {
  thresholds: Thresholds;
  onChange: (next: Thresholds) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = React.useState(thresholds);
  const [saving, setSaving] = React.useState(false);

  const dirty =
    draft.dayRed !== thresholds.dayRed ||
    draft.dayOrange !== thresholds.dayOrange ||
    draft.weekRed !== thresholds.weekRed ||
    draft.weekOrange !== thresholds.weekOrange;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save your thresholds.");
      onChange(payload.thresholds as Thresholds);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save your thresholds.");
    } finally {
      setSaving(false);
    }
  }

  const rows = [
    { label: "Daily", red: "dayRed", orange: "dayOrange" },
    { label: "Weekly", red: "weekRed", orange: "weekOrange" },
  ] as const;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">Thresholds</h2>
        {dirty && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        )}
      </div>
      <p className="mb-4 text-[11px] text-white/40">
        Below the first number is red, up to the second is orange, above it is
        green. Decimals are kept, so 74.9 lets an exact 75% through.
      </p>

      <div className="flex flex-col gap-4">
        {rows.map(({ label, red, orange }) => (
          <div key={label} className="flex flex-wrap items-center gap-3">
            <span className="w-16 shrink-0 text-[12px] text-white/60">{label}</span>

            <label className="flex items-center gap-2">
              <span className="text-[11px] text-red-400">red below</span>
              <input
                value={draft[red]}
                onChange={(e) =>
                  setDraft({ ...draft, [red]: Number(e.target.value) || 0 })
                }
                type="number"
                min="0"
                max="100"
                step="0.1"
                aria-label={`${label} red threshold`}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] tabular-nums text-white outline-none focus:border-neutral-500"
              />
              <span className="text-[11px] text-white/30">%</span>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-[11px] text-orange-400">orange up to</span>
              <input
                value={draft[orange]}
                onChange={(e) =>
                  setDraft({ ...draft, [orange]: Number(e.target.value) || 0 })
                }
                type="number"
                min="0"
                max="100"
                step="0.1"
                aria-label={`${label} orange threshold`}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] tabular-nums text-white outline-none focus:border-neutral-500"
              />
              <span className="text-[11px] text-white/30">%</span>
            </label>

            <span className="text-[11px] text-emerald-400">green above</span>
          </div>
        ))}
      </div>
    </section>
  );
}
