import { randomUUID } from "node:crypto";

import { db, GOALS_COLLECTION } from "@/lib/firebase";
import type { Goal } from "@/lib/goal";

export type NewGoal = Omit<Goal, "id">;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A week has seven days, so no target above it could ever be met. */
const MAX_PER_WEEK = 7;

function goals() {
  return db().collection(GOALS_COLLECTION);
}

export function parseNewGoal(
  body: unknown
): { ok: true; value: NewGoal } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { ok: false, error: "A goal needs a title." };
  if (title.length > 120) return { ok: false, error: "That title is too long (max 120)." };

  const timesPerWeek = Number(b.timesPerWeek);
  if (!Number.isInteger(timesPerWeek) || timesPerWeek < 1 || timesPerWeek > MAX_PER_WEEK) {
    return {
      ok: false,
      error: "`timesPerWeek` must be a whole number between 1 and 7.",
    };
  }

  const rules: string[] = [];
  if (b.rules !== undefined) {
    if (!Array.isArray(b.rules)) {
      return { ok: false, error: "`rules` must be an array." };
    }
    if (b.rules.length > 50) {
      return { ok: false, error: "Too many rules (max 50)." };
    }
    for (const raw of b.rules) {
      const rule = typeof raw === "string" ? raw.trim() : "";
      if (rule) rules.push(rule.slice(0, 300));
    }
  }

  const checkIns: string[] = [];
  if (b.checkIns !== undefined) {
    if (!Array.isArray(b.checkIns)) {
      return { ok: false, error: "`checkIns` must be an array." };
    }
    for (const raw of b.checkIns) {
      if (typeof raw === "string" && DATE_RE.test(raw) && !checkIns.includes(raw)) {
        checkIns.push(raw);
      }
    }
    checkIns.sort();
  }

  const startedOn =
    typeof b.startedOn === "string" && DATE_RE.test(b.startedOn)
      ? b.startedOn
      : new Date().toISOString().slice(0, 10);

  return {
    ok: true,
    value: {
      title,
      timesPerWeek,
      rules,
      published: b.published === true,
      checkIns,
      startedOn,
    },
  };
}

function hydrate(id: string, data: Record<string, unknown>): Goal | null {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) return null;

  const timesPerWeek = Number(data.timesPerWeek);

  return {
    id,
    title,
    timesPerWeek:
      Number.isInteger(timesPerWeek) && timesPerWeek >= 1 && timesPerWeek <= MAX_PER_WEEK
        ? timesPerWeek
        : 1,
    rules: Array.isArray(data.rules)
      ? (data.rules as unknown[]).filter(
          (r): r is string => typeof r === "string" && r !== ""
        )
      : [],
    published: data.published === true,
    checkIns: Array.isArray(data.checkIns)
      ? (data.checkIns as unknown[])
          .filter((d): d is string => typeof d === "string" && DATE_RE.test(d))
          .sort()
      : [],
    // Rows written before this field existed fall back to their first tick.
    startedOn:
      typeof data.startedOn === "string" && DATE_RE.test(data.startedOn)
        ? data.startedOn
        : Array.isArray(data.checkIns) && typeof data.checkIns[0] === "string"
          ? (data.checkIns[0] as string)
          : new Date().toISOString().slice(0, 10),
  };
}

export async function listGoals(): Promise<Goal[]> {
  const snapshot = await goals().get();
  return snapshot.docs
    .map((doc) => hydrate(doc.id, doc.data()))
    .filter((g): g is Goal => g !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function addGoal(input: NewGoal): Promise<Goal> {
  const created: Goal = { id: randomUUID(), ...input };
  const { id, ...fields } = created;
  await goals().doc(id).set(fields);
  return created;
}

export async function updateGoal(id: string, input: NewGoal): Promise<Goal | null> {
  const doc = goals().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  await doc.set(input);
  return { id, ...input };
}

export async function deleteGoal(id: string): Promise<boolean> {
  const doc = goals().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return false;

  await doc.delete();
  return true;
}

/**
 * Ticks or unticks one day. Its own operation on purpose: a tick never sends
 * the whole goal back, so it cannot clobber a rule you are editing elsewhere.
 */
export async function setCheckIn(
  id: string,
  date: string,
  done: boolean
): Promise<Goal | null> {
  if (!DATE_RE.test(date)) return null;

  const doc = goals().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  const goal = hydrate(id, existing.data() ?? {});
  if (!goal) return null;

  const next = done
    ? [...new Set([...goal.checkIns, date])].sort()
    : goal.checkIns.filter((d) => d !== date);

  await doc.update({ checkIns: next });
  return { ...goal, checkIns: next };
}
