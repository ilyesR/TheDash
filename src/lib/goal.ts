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

export type DayState = "done" | "future" | "past" | "empty";

/**
 * Every elapsed day is settled history and shows black; only today is scored.
 * The weekly calendar is where the past gets its verdict, so repeating it here
 * would just be noise on days you can no longer change the outcome of.
 */
export function dayState(goals: Goal[], date: string, todayDate = today()): DayState {
  if (date > todayDate) return "future";
  if (date < todayDate) return "past";
  if (goals.length === 0) return "empty";

  // Only goals already running that day have any say over its colour.
  const live = goals.filter((g) => g.startedOn <= date);
  if (live.length === 0) return "empty";

  return live.some((g) => g.checkIns.includes(date)) ? "done" : "empty";
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


// ------------------------------------------------------------------ scoring

/**
 * Where a completion rate turns from red to orange to green. Percentages, and
 * yours to set: what counts as a good week is not something an app decides.
 */
export type Thresholds = {
  dayRed: number;
  dayOrange: number;
  weekRed: number;
  weekOrange: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  dayRed: 50,
  dayOrange: 80,
  weekRed: 50,
  weekOrange: 80,
};

export type Band = "red" | "orange" | "green";

export function band(rate: number, below: number, upTo: number): Band {
  if (rate < below) return "red";
  if (rate <= upTo) return "orange";
  return "green";
}

/**
 * The day a goal actually began counting. Ticking a day earlier than
 * `startedOn` says it was already running then, and a day you ticked must never
 * be treated as one where nothing was expected of you.
 */
export function effectiveStart(goal: Goal) {
  const first = goal.checkIns[0];
  return first && first < goal.startedOn ? first : goal.startedOn;
}

/** Goals already running on that day; nothing else can be expected of it. */
export function liveOn(goals: Goal[], date: string) {
  return goals.filter((g) => effectiveStart(g) <= date);
}

/**
 * Days you may skip a goal in a week without owing anything. A target of five
 * out of seven is a promise to show up five times, not seven — the other two
 * are rest days you chose when you set the target.
 */
export function allowedSkips(goal: Goal) {
  return 7 - goal.timesPerWeek;
}

export type DayVerdict =
  /** Ticked. */
  | "done"
  /** Not ticked, and the week's skips are spent — this one is owed. */
  | "missed"
  /** Not ticked, but still within the week's skips. */
  | "excused"
  /** The goal was not running yet. */
  | "off";

/**
 * What one goal makes of one day. Skips are spent in date order, so an early
 * miss is free and the same miss later in the week is not: with five out of
 * seven, skipping Tuesday and Thursday costs nothing, and Friday is the one
 * that counts.
 */
export function dayVerdict(goal: Goal, date: string): DayVerdict {
  const start = effectiveStart(goal);
  if (start > date) return "off";
  if (goal.checkIns.includes(date)) return "done";

  // Days before the goal existed are not skips it chose to take.
  let skipped = 0;
  for (const day of weekDays(date)) {
    if (day > date) break;
    if (day < start) continue;
    if (!goal.checkIns.includes(day)) skipped += 1;
  }

  return skipped <= allowedSkips(goal) ? "excused" : "missed";
}

/**
 * Share of what that day actually owed you that you delivered. Excused skips
 * leave the sum entirely rather than counting against you, so returns null for
 * a day that owed nothing — no goal running, or every one of them resting.
 */
export function dayRate(goals: Goal[], date: string): number | null {
  let done = 0;
  let owed = 0;

  for (const goal of goals) {
    const verdict = dayVerdict(goal, date);
    if (verdict === "done") done += 1;
    if (verdict === "done" || verdict === "missed") owed += 1;
  }

  return owed === 0 ? null : Math.round((done / owed) * 100);
}

/**
 * The week scored as points: every box the week asks you to tick is one point.
 * Gym 5× and No Smoking 7× make twelve boxes, and eleven ticks is 92%.
 *
 * A goal is capped at its own target, because there is no thirteenth box: a
 * sixth gym session cannot buy back a cigarette.
 */
export function weekPoints(goals: Goal[], date: string) {
  const start = weekStart(date);
  const live = goals.filter((g) => weekStart(effectiveStart(g)) <= start);

  let points = 0;
  let boxes = 0;
  for (const goal of live) {
    points += Math.min(countInWeek(goal, start), goal.timesPerWeek);
    boxes += goal.timesPerWeek;
  }

  return { points, boxes };
}

/** That points total as a percentage, or null for a week that asked nothing. */
export function weekRate(goals: Goal[], date: string): number | null {
  const { points, boxes } = weekPoints(goals, date);
  return boxes === 0 ? null : Math.round((points / boxes) * 100);
}
