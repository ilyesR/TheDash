"use client";

import * as React from "react";

import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_HARAM,
  DEFAULT_INCOME_CATEGORIES,
} from "@/lib/categories";
import type { TransactionType } from "@/lib/transaction";

export type Category = {
  id: string;
  name: string;
  kind: TransactionType;
  /** Marked as non-permissible spending; hidden while halal mode is on. */
  haram: boolean;
};

/**
 * Categories live in Firestore so they can be edited from the app. The built-in
 * list stands in until the fetch resolves, so a picker is never empty.
 */
const FALLBACK: Category[] = [
  ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    id: name,
    name,
    kind: "expense" as const,
    haram: DEFAULT_HARAM.includes(name),
  })),
  ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
    id: name,
    name,
    kind: "income" as const,
    haram: DEFAULT_HARAM.includes(name),
  })),
];

/**
 * One shared list for the whole page. Per-component state let the filter menu
 * mark a category while the charts kept rendering from their own stale copy.
 */
let snapshot: Category[] = FALLBACK;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const notify of listeners) notify();
}

async function load() {
  const res = await fetch("/api/categories").catch(() => null);
  const payload = await res?.json().catch(() => null);
  if (res?.ok && payload?.categories) {
    snapshot = payload.categories as Category[];
    emit();
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  // Guarded so a page with several consumers still issues one request.
  if (!started) {
    started = true;
    void load();
  }

  return () => {
    listeners.delete(onChange);
  };
}

function readSnapshot() {
  return snapshot;
}

function serverSnapshot() {
  return FALLBACK;
}

export function useCategories() {
  const categories = React.useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);

  const setCategories = React.useCallback(
    (update: Category[] | ((current: Category[]) => Category[])) => {
      snapshot = typeof update === "function" ? update(snapshot) : update;
      emit();
    },
    []
  );

  const refresh = React.useCallback(() => load(), []);

  const namesFor = React.useCallback(
    (kind: TransactionType) =>
      categories.filter((c) => c.kind === kind).map((c) => c.name),
    [categories]
  );

  return { categories, namesFor, refresh, setCategories };
}
