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
} from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import { cn } from "@/lib/utils";
import type { Goal } from "@/lib/goal";
import {
  addDays,
  band,
  countInWeek,
  dayRate,
  DEFAULT_THRESHOLDS,
  today,
  weekDays,
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

  /** Only published goals are tracked; drafts stay out of the calendars. */
  const published = React.useMemo(() => goals.filter((g) => g.published), [goals]);
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
            <>
              <DayPanel
                goals={published}
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

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DailyCalendar
                  goals={published}
                  today={now}
                  selected={selected}
                  onSelect={setSelected}
                  thresholds={thresholds}
                />
                <WeeklyCalendar goals={published} today={now} thresholds={thresholds} />
              </div>
            </>
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

function DayPanel({
  goals,
  date: now,
  today: realToday,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onDateChange,
}: {
  goals: Goal[];
  date: string;
  today: string;
  busy: string | null;
  onToggle: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
  onDateChange: (next: string) => void;
}) {
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

      {goals.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-white/35">
          Nothing published yet — publish a goal to start ticking.
        </p>
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
                  <span
                    className={cn(
                      "text-[14px]",
                      ticked ? "text-white/50 line-through" : "text-white"
                    )}
                  >
                    {goal.title}
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

/** Monday-first grid, oldest week at the top, one row per week. */
function DailyCalendar({
  goals,
  today: now,
  selected,
  onSelect,
  thresholds,
}: {
  goals: Goal[];
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
      <h2 className="mb-1 text-sm font-semibold text-white">Daily</h2>
      <p className="mb-4 text-[11px] text-white/40">
Coloured by the share of that day&apos;s goals you ticked, against the
        thresholds you set. Black means nothing was running yet. Click a day to fix
        it up.
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
              const future = date > now;
              const rate = future ? null : dayRate(goals, date);
              const tone =
                rate === null ? null : band(rate, thresholds.dayRed, thresholds.dayOrange);

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelect(date)}
                  disabled={date > now}
                  title={rate === null ? date : `${date} — ${rate}% done`}
                  aria-label={`Show ${date}`}
                  className={cn(
                    "size-6 rounded transition-transform enabled:hover:scale-110",
                    tone === "green" && "bg-emerald-500/70",
                    tone === "orange" && "bg-orange-500/70",
                    tone === "red" && "bg-red-500/60",
                    // Nothing was running that day, so there is no rate to show.
                    rate === null && !future && "bg-black",
                    future && "bg-neutral-800/40",
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
        Coloured by how much of the week&apos;s targets you met. Each goal counts up
        to its own target, so overshooting one cannot cover for missing another.
      </p>

      <ul className="flex flex-col">
        {[...weeks].reverse().map((monday) => {
          const rate = weekRate(goals, monday);
          const tone =
            rate === null ? null : band(rate, thresholds.weekRed, thresholds.weekOrange);
          const hit = goals.filter((g) => countInWeek(g, monday) >= g.timesPerWeek).length;

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
                {rate === null ? "—" : `${rate}%`} · {hit}/{goals.length} goals
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
        startedOn: goal?.startedOn ?? today(),
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
        Below the first number is red, up to the second is orange, above it is green.
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
