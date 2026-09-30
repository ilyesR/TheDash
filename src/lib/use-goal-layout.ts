"use client";

import * as React from "react";

export type GoalLayout = "list" | "cards";

const STORAGE_KEY = "thedash:goal-layout";

const DEFAULT_LAYOUT: GoalLayout = "cards";

/** Same shared-store shape as the other view preferences. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(): GoalLayout {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "cards" || value === "list" ? value : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** The server cannot know the choice, so it renders the default. */
function serverSnapshot(): GoalLayout {
  return DEFAULT_LAYOUT;
}

/** How the day's goals are laid out: one per row, or as cards. */
export function useGoalLayout() {
  const layout = React.useSyncExternalStore(subscribe, readStored, serverSnapshot);

  const setLayout = React.useCallback((next: GoalLayout) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is acceptable; this page still updates below.
    }
    for (const notify of listeners) notify();
  }, []);

  return { layout, setLayout };
}
