import { db, SETTINGS_COLLECTION } from "@/lib/firebase";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/goal";

/** One well-known document; there is only ever one set of settings. */
const DOC_ID = "thresholds";

function doc() {
  return db().collection(SETTINGS_COLLECTION).doc(DOC_ID);
}

function clampPercent(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

export function parseThresholds(
  body: unknown
): { ok: true; value: Thresholds } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const value: Thresholds = {
    dayRed: clampPercent(b.dayRed, DEFAULT_THRESHOLDS.dayRed),
    dayOrange: clampPercent(b.dayOrange, DEFAULT_THRESHOLDS.dayOrange),
    weekRed: clampPercent(b.weekRed, DEFAULT_THRESHOLDS.weekRed),
    weekOrange: clampPercent(b.weekOrange, DEFAULT_THRESHOLDS.weekOrange),
  };

  // Orange has to sit above red, or the middle band would be empty.
  if (value.dayOrange < value.dayRed) {
    return { ok: false, error: "The daily orange threshold must be at or above the red one." };
  }
  if (value.weekOrange < value.weekRed) {
    return {
      ok: false,
      error: "The weekly orange threshold must be at or above the red one.",
    };
  }

  return { ok: true, value };
}

export async function readThresholds(): Promise<Thresholds> {
  const snapshot = await doc().get();
  if (!snapshot.exists) return DEFAULT_THRESHOLDS;

  const parsed = parseThresholds(snapshot.data());
  return parsed.ok ? parsed.value : DEFAULT_THRESHOLDS;
}

export async function writeThresholds(value: Thresholds): Promise<Thresholds> {
  await doc().set(value);
  return value;
}
