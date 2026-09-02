/** Client-safe goal types and the week maths both sides rely on. */

export type Goal = {
  id: string;
  title: string;
  /** How many times it must be ticked within one week. */
  timesPerWeek: number;
  /** Conditions you set for yourself; shown when ticking. */
  rules: string[];
  /** Drafts are editable but not tracked; publishing starts the counting. */
  published: boolean;
  /** ISO dates (`YYYY-MM-DD`) on which the goal was ticked. */
  checkIns: string[];
  /**
   * The day tracking began. Nothing before it is judged: a goal created today
   * has not failed every week that came before it.
   */
  startedOn: string;
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Monday of the week containing `date`, as `YYYY-MM-DD`. Weeks start on Monday
 * (ISO), which is what a European week means — not Sunday.
 */
export function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const backToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - backToMonday);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The seven dates of the week containing `date`, Monday first. */
export function weekDays(date: string) {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** How many times a goal was ticked in the week containing `date`. */
export function countInWeek(goal: Goal, date: string) {
  const days = new Set(weekDays(date));
  return goal.checkIns.filter((d) => days.has(d)).length;
}

export function hitTargetThatWeek(goal: Goal, date: string) {
  return countInWeek(goal, date) >= goal.timesPerWeek;
}

export type DayState = "done" | "missed" | "future" | "empty";

/**
 * A day is green as soon as something was ticked on it, red when a past day
 * went by with nothing. Weekly targets say nothing about *which* days, so a
 * stricter daily rule would invent a schedule you never set.
 */
export function dayState(goals: Goal[], date: string, todayDate = today()): DayState {
  if (goals.length === 0) return "empty";
  if (date > todayDate) return "future";

  // Only goals already running that day have any say over its colour.
  const live = goals.filter((g) => g.startedOn <= date);
  if (live.length === 0) return "empty";

  const ticked = live.some((g) => g.checkIns.includes(date));
  if (ticked) return "done";
  return date === todayDate ? "empty" : "missed";
}

export type WeekState = "done" | "missed" | "running" | "empty";

/** A week is green only when every published goal reached its own target. */
export function weekState(goals: Goal[], date: string, todayDate = today()): WeekState {
  if (goals.length === 0) return "empty";

  const start = weekStart(date);
  const currentStart = weekStart(todayDate);

  if (start > currentStart) return "empty";

  // A goal is judged only from the week it started in, so publishing today
  // does not paint every earlier week red.
  const live = goals.filter((g) => weekStart(g.startedOn) <= start);
  if (live.length === 0) return "empty";

  const allHit = live.every((g) => hitTargetThatWeek(g, start));
  if (allHit) return "done";

  // The running week has not had its chance yet; do not mark it failed.
  return start === currentStart ? "running" : "missed";
}
