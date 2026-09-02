"use client";

import * as React from "react";
import { Menu, Loader2, Check, HandCoins, Undo2, Plus, X, Trash2 } from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import { cn } from "@/lib/utils";
import type { Debt, Transaction } from "@/lib/transaction";
import CurrencyAmount from "@/components/ui/currency-amount";
import type { SupportedCurrency } from "@/lib/fx";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

/**
 * One share someone owes you. It either comes from a split bill (and lives
 * inside that transaction's participants array) or was entered by hand as a
 * standalone debt.
 */
type Entry =
  | {
      /** Set when the amount was entered in something other than euros. */
      original?: { amount: number; currency: string };
      source: "split";
      key: string;
      person: string;
      amount: number;
      label: string;
      date: string;
      settled: boolean;
      transaction: Transaction;
      index: number;
    }
  | {
      original?: { amount: number; currency: string };
      source: "manual";
      key: string;
      person: string;
      amount: number;
      label: string;
      date: string;
      settled: boolean;
      debt: Debt;
    };

type Person = {
  name: string;
  owed: number;
  settledTotal: number;
  entries: Entry[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function flatten(transactions: Transaction[], debts: Debt[]): Entry[] {
  const fromSplits: Entry[] = transactions.flatMap((t) =>
    t.participants.map((p, index) => ({
      source: "split" as const,
      key: `${t.id}:${index}`,
      person: p.name.trim(),
      amount: t.amount,
      label: t.label,
      date: t.date,
      settled: p.settled,
      transaction: t,
      index,
      original:
        t.currency === "EUR"
          ? undefined
          : // Each sharer owes an equal slice of the original charge too.
            { amount: Math.round((t.originalAmount / 1) * 100) / 100, currency: t.currency },
    }))
  );

  const fromManual: Entry[] = debts.map((d) => ({
    source: "manual" as const,
    key: `debt:${d.id}`,
    person: d.person.trim(),
    amount: d.amount,
    label: d.label || "Payback",
    date: d.date,
    settled: d.settled,
    debt: d,
    original:
      d.currency === "EUR" ? undefined : { amount: d.originalAmount, currency: d.currency },
  }));

  return [...fromSplits, ...fromManual];
}

/**
 * Groups every entry under one person. Names match case-insensitively so
 * "Marc" and "marc" are the same person; the capitalised spelling wins.
 */
function groupByPerson(entries: Entry[], includeSettled: boolean): Person[] {
  const people = new Map<string, Person>();

  for (const entry of entries) {
    if (entry.settled && !includeSettled) continue;
    const key = entry.person.toLowerCase();
    if (!key) continue;

    const person =
      people.get(key) ?? { name: entry.person, owed: 0, settledTotal: 0, entries: [] };

    if (
      person.name[0] !== person.name[0].toUpperCase() &&
      entry.person[0] === entry.person[0].toUpperCase()
    ) {
      person.name = entry.person;
    }

    if (entry.settled) person.settledTotal += entry.amount;
    else person.owed += entry.amount;

    person.entries.push(entry);
    people.set(key, person);
  }

  return [...people.values()]
    .map((p) => ({
      ...p,
      owed: Math.round(p.owed * 100) / 100,
      settledTotal: Math.round(p.settledTotal * 100) / 100,
      entries: [...p.entries].sort((a, b) => (a.date < b.date ? 1 : -1)),
    }))
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}

export default function PaybackView() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [debts, setDebts] = React.useState<Debt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showSettled, setShowSettled] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [txRes, debtRes] = await Promise.all([
          fetch("/api/transactions"),
          fetch("/api/debts"),
        ]);
        const txPayload = await txRes.json();
        const debtPayload = await debtRes.json();
        if (!txRes.ok) throw new Error(txPayload?.error ?? "Could not load your transactions.");
        if (!debtRes.ok) throw new Error(debtPayload?.error ?? "Could not load your paybacks.");
        if (!cancelled) {
          setTransactions(txPayload.transactions);
          setDebts(debtPayload.debts);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const people = React.useMemo(
    () => groupByPerson(flatten(transactions, debts), showSettled),
    [transactions, debts, showSettled]
  );

  const totalOwed = React.useMemo(
    () => Math.round(people.reduce((sum, p) => sum + p.owed, 0) * 100) / 100,
    [people]
  );

  /** Existing names, so the manual form can suggest people you already track. */
  const knownNames = React.useMemo(() => {
    // Keyed case-insensitively so "Marc" and "marc" suggest once, keeping the
    // capitalised spelling.
    const names = new Map<string, string>();
    for (const e of flatten(transactions, debts)) {
      if (!e.person) continue;
      const key = e.person.toLowerCase();
      const kept = names.get(key);
      if (!kept || (kept[0] !== kept[0].toUpperCase() && e.person[0] === e.person[0].toUpperCase())) {
        names.set(key, e.person);
      }
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [transactions, debts]);

  async function setEntrySettled(entry: Entry, settled: boolean) {
    setBusy(entry.key);
    setError(null);
    try {
      if (entry.source === "manual") {
        const d = entry.debt;
        const res = await fetch(`/api/debts/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...d, settled }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
        setDebts((list) => list.map((x) => (x.id === d.id ? (payload.debt as Debt) : x)));
        return;
      }

      const t = entry.transaction;
      const participants = t.participants.map((p, i) =>
        i === entry.index ? { ...p, settled } : p
      );
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t, participants }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
      setTransactions((list) =>
        list.map((x) => (x.id === t.id ? (payload.transaction as Transaction) : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function settleAll(person: Person) {
    const pending = person.entries.filter((e) => !e.settled);
    setBusy(`all:${person.name}`);
    setError(null);
    try {
      // Sequential on purpose: two shares can sit on the same transaction, and
      // parallel writes would each overwrite the other's participants array.
      for (const entry of pending) {
        await setEntrySettled(entry, true);
      }
    } finally {
      setBusy(null);
    }
  }

  async function removeManual(debt: Debt) {
    const previous = debts;
    setDebts((list) => list.filter((d) => d.id !== debt.id));
    try {
      const res = await fetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setDebts(previous);
      setError("Could not delete that payback.");
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
              <h1 className="text-xl font-semibold text-white">Pay back</h1>
              <p className="text-[12px] text-white/45">
                Who still owes you, from split bills and money you lent.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettled((v) => !v)}
              aria-pressed={showSettled}
              className={cn(
                "rounded-lg border px-3 py-2 text-[13px] transition-colors",
                showSettled
                  ? "border-neutral-600 bg-neutral-800 text-white"
                  : "border-neutral-800 bg-neutral-900/70 text-white/55 hover:text-white"
              )}
            >
              {showSettled ? "Hide settled" : "Show settled"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add a payback</span>
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

          {loading ? (
            <p className="flex items-center gap-2 py-10 text-[13px] text-white/40">
              <Loader2 size={15} className="animate-spin" />
              Loading…
            </p>
          ) : people.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16 text-center">
              <HandCoins size={22} className="mb-3 text-white/25" />
              <p className="text-[13px] text-white/50">Nobody owes you anything.</p>
              <p className="mt-1 max-w-[340px] text-[12px] text-white/30">
                Split a bill and name who paid with you, or add a payback by hand for
                money you lent.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <p className="text-[12px] text-white/45">Total still owed to you</p>
                <p className="mt-1 text-2xl font-semibold text-amber-300">
                  {money.format(totalOwed)}
                </p>
                <p className="mt-1 text-[11px] text-white/35">
                  across {people.filter((p) => p.owed > 0).length} person
                  {people.filter((p) => p.owed > 0).length === 1 ? "" : "s"}
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {people.map((person) => (
                  <li
                    key={person.name.toLowerCase()}
                    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500/25 text-[12px] font-semibold uppercase text-violet-200">
                          {person.name.slice(0, 2)}
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span className="text-[14px] font-medium text-white">
                            {person.name}
                          </span>
                          <span className="text-[11px] text-white/40">
                            {person.entries.filter((e) => !e.settled).length} unpaid
                            {person.settledTotal > 0 &&
                              ` · ${money.format(person.settledTotal)} settled`}
                          </span>
                        </span>
                      </span>

                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            "text-lg font-semibold tabular-nums",
                            person.owed > 0 ? "text-amber-300" : "text-emerald-400"
                          )}
                        >
                          {money.format(person.owed)}
                        </span>
                        {person.owed > 0 && (
                          <button
                            type="button"
                            onClick={() => settleAll(person)}
                            disabled={busy !== null}
                            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
                          >
                            {busy === `all:${person.name}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Settle all
                          </button>
                        )}
                      </span>
                    </div>

                    <ul className="mt-3 flex flex-col border-t border-neutral-800/70 pt-1">
                      {person.entries.map((entry) => (
                        <li
                          key={entry.key}
                          className="flex items-center gap-3 border-b border-neutral-800/40 py-2 last:border-0"
                        >
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span
                              className={cn(
                                "truncate text-[13px]",
                                entry.settled ? "text-white/40 line-through" : "text-white/80"
                              )}
                            >
                              {entry.label}
                            </span>
                            <span className="flex items-center gap-1.5 text-[11px] text-white/35">
                              {entry.source === "split" ? (
                                <>
                                  {entry.date} · split {entry.transaction.splitWays} ways
                                </>
                              ) : (
                                <span className="rounded border border-neutral-700 px-1 text-[10px] text-white/45">
                                  manual
                                </span>
                              )}
                            </span>
                          </span>

                          <span className="ml-auto flex shrink-0 flex-col items-end leading-tight">
                            <span
                              className={cn(
                                "text-[13px] tabular-nums",
                                entry.settled ? "text-white/30" : "text-amber-300"
                              )}
                            >
                              {money.format(entry.amount)}
                            </span>
                            {entry.original && (
                              <span className="text-[10px] text-white/35">
                                {entry.original.amount.toFixed(2)} {entry.original.currency}
                              </span>
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEntrySettled(entry, !entry.settled)}
                            disabled={busy !== null}
                            aria-label={
                              entry.settled
                                ? `Mark ${person.name} as still owing for ${entry.label}`
                                : `Mark ${person.name} as paid back for ${entry.label}`
                            }
                            className={cn(
                              "shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
                              entry.settled
                                ? "border-neutral-700 text-white/45 hover:text-white"
                                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            )}
                          >
                            {busy === entry.key ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : entry.settled ? (
                              <span className="flex items-center gap-1">
                                <Undo2 size={11} />
                                Undo
                              </span>
                            ) : (
                              "Mark paid"
                            )}
                          </button>

                          {entry.source === "manual" && (
                            <button
                              type="button"
                              onClick={() => removeManual(entry.debt)}
                              disabled={busy !== null}
                              aria-label={`Delete payback ${entry.label}`}
                              className="shrink-0 rounded-md p-1 text-white/25 transition-colors hover:text-red-400 disabled:opacity-40"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </div>

      {adding && (
        <AddPaybackDialog
          knownNames={knownNames}
          onClose={() => setAdding(false)}
          onCreated={(debt) => setDebts((list) => [debt, ...list])}
        />
      )}
    </div>
  );
}

function AddPaybackDialog({
  knownNames,
  onClose,
  onCreated,
}: {
  knownNames: string[];
  onClose: () => void;
  onCreated: (debt: Debt) => void;
}) {
  const [person, setPerson] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [currency, setCurrency] = React.useState<SupportedCurrency>("EUR");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const personRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => personRef.current?.focus(), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!person.trim()) {
      setError("Who owes you?");
      return;
    }
    if (!(Number(amount) > 0)) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Stamped rather than asked for: it only drives ordering, and the
          // form no longer shows it.
          date: today(),
          person: person.trim(),
          amount: Number(amount),
          currency,
          convertFromOriginal: currency !== "EUR",
          label: label.trim(),
          settled: false,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save that payback.");
      onCreated(payload.debt as Debt);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that payback.");
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
        aria-labelledby="add-payback-title"
        className="relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-payback-title" className="text-sm font-semibold text-white">
            Add a payback
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

        <p className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-[11px] text-white/45">
          Money someone owes you outside a purchase — cash lent, a ticket bought for a
          friend. It is a receivable, so it never counts as one of your expenses.
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Who owes you</span>
            <input
              ref={personRef}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              list="known-people"
              placeholder="Marc"
              maxLength={60}
              className={FIELD}
            />
            <datalist id="known-people">
              {knownNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>

          <CurrencyAmount
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            fieldClassName={FIELD}
            label="Amount owed"
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">What for (optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Concert ticket, cash lent…"
              maxLength={120}
              className={FIELD}
            />
          </label>

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
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
