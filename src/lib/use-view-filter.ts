"use client";

import * as React from "react";

import { useCategories } from "@/lib/use-categories";
import { haramNames, useHalalMode } from "@/lib/use-halal";

/** Where the "recent" period starts. One place to change it. */
export const PERIOD_START = "2026-09-01";

export type Period = "all" | "recent";

const STORAGE_KEY = "thedash:period";

/** Since 1 September unless you chose otherwise. */
const DEFAULT_PERIOD: Period = "recent";

/**
 * Subscribers on this page, plus the cross-tab `storage` event. One shared
 * store rather than per-page state, so the choice follows you from the
 * dashboard to every other tab instead of resetting on each.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(): Period {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "all" || value === "recent" ? value : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
}

function serverSnapshot(): Period {
  return DEFAULT_PERIOD;
}

export function usePeriod() {
  const period = React.useSyncExternalStore(subscribe, readStored, serverSnapshot);

  const setPeriod = React.useCallback((next: Period) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is acceptable; this page still updates below.
    }
    for (const notify of listeners) notify();
  }, []);

  return { period, setPeriod };
}

/**
 * Everything the header filters hide, as one predicate. Every page filters
 * through this, so a total on one tab can never include what another tab
 * leaves out. It only ever hides: nothing is deleted.
 */
export function useViewFilter() {
  const { period } = usePeriod();
  const { enabled: halal } = useHalalMode();
  const { categories } = useCategories();

  const keep = React.useMemo(() => {
    const hidden = halal ? haramNames(categories) : null;
    return (item: { date: string; category?: string }) => {
      if (period === "recent" && item.date < PERIOD_START) return false;
      if (hidden && item.category && hidden.has(item.category.toLowerCase())) return false;
      return true;
    };
  }, [period, halal, categories]);

  return { period, halal, keep };
}
