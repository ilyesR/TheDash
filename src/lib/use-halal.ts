"use client";

import * as React from "react";

const STORAGE_KEY = "thedash:halal-mode";

/**
 * Subscribers on this page, plus the browser's own cross-tab `storage` event.
 * Without the local set, toggling in the header would not refresh the charts
 * rendered by a sibling component.
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

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private browsing can block storage; treat it as off.
    return false;
  }
}

/** The server has no localStorage, so it always renders the unfiltered view. */
function serverSnapshot() {
  return false;
}

/**
 * Halal mode is a view filter, never a deletion: transactions in categories you
 * marked as non-permissible are hidden from totals and charts, but stay in the
 * database and can be shown again at any time.
 */
export function useHalalMode() {
  const enabled = React.useSyncExternalStore(subscribe, readStored, serverSnapshot);

  const toggle = React.useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readStored() ? "0" : "1");
    } catch {
      // Not persisting is acceptable; nothing else depends on it succeeding.
    }
    for (const notify of listeners) notify();
  }, []);

  return { enabled, toggle };
}

/** Lower-cased names of the categories to hide while halal mode is on. */
export function haramNames(categories: { name: string; haram?: boolean }[]) {
  return new Set(
    categories.filter((c) => c.haram === true).map((c) => c.name.toLowerCase())
  );
}
