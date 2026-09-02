"use client";

import * as React from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Check,
  X,
  Users,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useCategories } from "@/lib/use-categories";
import type { Project } from "@/lib/transaction";
import type { Transaction, TransactionType } from "@/lib/transaction";
import { formatOriginal, fullAmount, isForeign, isSplit } from "@/lib/transaction";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const FIELD =
  "w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[12px] text-white outline-none focus:border-neutral-500";

type SortKey = "date" | "amount" | "label" | "category";
type SortDir = "asc" | "desc";

/** Editable copy of a row while it is being modified in place. */
type EditState = {
  date: string;
  label: string;
  amount: string;
  category: string;
  type: TransactionType;
  projectId: string | null;
  splitWays: number;
  /**
   * The undivided bill, held separately so re-splitting 4 -> 3 -> 2 always
   * divides the original total instead of compounding rounding errors.
   */
  fullAmount: number;
};

/**
 * Defined at module scope: a component created inside the render body would
 * be a brand-new type on every keystroke, remounting the header each time.
 */
function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  align,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  align?: "right";
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={cn("px-2 py-2 font-normal", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-white",
          active && "text-white"
        )}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}

export default function TransactionsTable({
  transactions,
  onChanged,
}: {
  transactions: Transaction[];
  onChanged: (next: Transaction[]) => void;
}) {
  const [projects, setProjects] = React.useState<Project[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/projects").catch(() => null);
      if (!res?.ok || cancelled) return;
      const payload = await res.json().catch(() => null);
      if (!cancelled && payload?.projects) setProjects(payload.projects as Project[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { namesFor } = useCategories();
  const categoriesFor = React.useCallback(
    (type: TransactionType) => {
      const names = namesFor(type);
      return names.length > 0 ? names : ["Other"];
    },
    [namesFor]
  );

  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | TransactionType>("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [sortKey, setSortKey] = React.useState<SortKey>("date");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<EditState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const categories = React.useMemo(
    () => [...new Set(transactions.map((t) => t.category))].sort(),
    [transactions]
  );

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = transactions.filter((t) => {
      if (needle && !t.label.toLowerCase().includes(needle)) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      const left = sortKey === "date" ? a.date : sortKey === "label" ? a.label : a.category;
      const right = sortKey === "date" ? b.date : sortKey === "label" ? b.label : b.category;
      return left.localeCompare(right) * dir;
    });
  }, [transactions, query, typeFilter, categoryFilter, from, to, sortKey, sortDir]);

  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of visible) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [visible]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    // Dates and amounts read best largest-first; text reads best A-Z.
    setSortDir(key === "date" || key === "amount" ? "desc" : "asc");
  }

  function startEdit(t: Transaction) {
    setError(null);
    setEditingId(t.id);
    setDraft({
      date: t.date,
      label: t.label,
      amount: String(t.amount),
      category: t.category,
      type: t.type,
      projectId: t.projectId,
      splitWays: t.splitWays,
      fullAmount: Math.round(t.amount * t.splitWays * 100) / 100,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(original: Transaction) {
    if (!draft) return;

    if (!draft.label.trim()) {
      setError("A label is required.");
      return;
    }
    if (!(Number(draft.amount) > 0)) {
      setError("Amount must be greater than 0.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const share = Number(draft.amount);
      // Keep the foreign original proportional to the euro share.
      const ratio = original.amount > 0 ? share / original.amount : 1;

      const res = await fetch(`/api/transactions/${original.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: draft.date,
          label: draft.label.trim(),
          amount: share,
          currency: original.currency,
          originalAmount: Math.round(original.originalAmount * ratio * 100) / 100,
          splitWays: draft.splitWays,
          participants: original.participants,
          projectId: draft.projectId,
          type: draft.type,
          category: draft.category,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save.");

      onChanged(
        transactions.map((t) =>
          t.id === original.id ? (payload.transaction as Transaction) : t
        )
      );
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Transaction) {
    const previous = transactions;
    onChanged(transactions.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      onChanged(previous);
      setError("Could not delete that transaction.");
    }
  }

  /** Re-splits an already-saved row, dividing the full bill by the new count. */
  function adjustSplit(delta: number) {
    setDraft((d) => {
      if (!d) return d;
      const ways = Math.min(Math.max(d.splitWays + delta, 1), 50);
      return {
        ...d,
        splitWays: ways,
        amount: String(Math.round((d.fullAmount / ways) * 100) / 100),
      };
    });
  }


  const filtersActive =
    query !== "" || typeFilter !== "all" || categoryFilter !== "all" || from !== "" || to !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[180px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a label…"
            aria-label="Search transactions"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900/70 py-2 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-600"
          />
        </span>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | TransactionType)}
          aria-label="Filter by type"
          className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white outline-none focus:border-neutral-600"
        >
          <option value="all">All types</option>
          <option value="expense">Spent</option>
          <option value="income">Received</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white outline-none focus:border-neutral-600"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          type="date"
          aria-label="From date"
          className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white outline-none [color-scheme:dark] focus:border-neutral-600"
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="date"
          aria-label="To date"
          className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white outline-none [color-scheme:dark] focus:border-neutral-600"
        />

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTypeFilter("all");
              setCategoryFilter("all");
              setFrom("");
              setTo("");
            }}
            className="rounded-lg px-3 py-2 text-[13px] text-white/50 transition-colors hover:text-white"
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[12px]">
        <span className="text-white/45">
          {visible.length} of {transactions.length} transaction
          {transactions.length === 1 ? "" : "s"}
        </span>
        <span className="text-emerald-400">+{money.format(totals.income)}</span>
        <span className="text-red-400">−{money.format(totals.expense)}</span>
        <span className={cn(totals.net >= 0 ? "text-white" : "text-red-400")}>
          net {money.format(totals.net)}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/50">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-neutral-800 text-[11px] text-white/40">
              <SortHeader label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Label" sortKey="label" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortHeader label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-2 py-2 text-left font-normal">Type</th>
              <th className="px-2 py-2 text-left font-normal">Project</th>
              <SortHeader label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} align="right" onSort={toggleSort} />
              <th className="px-2 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-8 text-center text-[12px] text-white/35">
                  {transactions.length === 0
                    ? "Nothing recorded yet."
                    : "No transaction matches these filters."}
                </td>
              </tr>
            )}

            {visible.map((t) => {
              const editing = editingId === t.id && draft !== null;

              return (
                <tr key={t.id} className="border-b border-neutral-800/50 last:border-0">
                  <td className="px-2 py-2.5 align-middle">
                    {editing ? (
                      <input
                        value={draft.date}
                        onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                        type="date"
                        aria-label="Date"
                        className={cn(FIELD, "w-[130px] [color-scheme:dark]")}
                      />
                    ) : (
                      <span className="text-white/70">{t.date}</span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    {editing ? (
                      <input
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                        maxLength={120}
                        aria-label="Label"
                        className={FIELD}
                      />
                    ) : (
                      <span className="flex flex-col leading-tight">
                        <span className="text-white">{t.label}</span>
                        {(isForeign(t) || isSplit(t)) && (
                          <span className="text-[11px] text-white/40">
                            {isForeign(t) && formatOriginal(t)}
                            {isForeign(t) && isSplit(t) && " · "}
                            {isSplit(t) &&
                              `split ${t.splitWays} ways of ${money.format(fullAmount(t))}`}
                          </span>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    {editing ? (
                      <select
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        aria-label="Category"
                        className={FIELD}
                      >
                        {categoriesFor(draft.type).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-white/60">{t.category}</span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = draft.type === "expense" ? "income" : "expense";
                          const allowed = categoriesFor(next);
                          setDraft({
                            ...draft,
                            type: next,
                            category: allowed.includes(draft.category) ? draft.category : allowed[0],
                          });
                        }}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px]",
                          draft.type === "expense"
                            ? "border-red-500/40 bg-red-500/15 text-red-300"
                            : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        )}
                      >
                        {draft.type === "expense" ? "Spent" : "Received"}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "text-[11px]",
                          t.type === "expense" ? "text-red-400" : "text-emerald-400"
                        )}
                      >
                        {t.type === "expense" ? "Spent" : "Received"}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    {editing ? (
                      <select
                        value={draft.projectId ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, projectId: e.target.value || null })
                        }
                        aria-label="Project"
                        className={FIELD}
                      >
                        <option value="">—</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[12px] text-white/45">
                        {projects.find((p) => p.id === t.projectId)?.name ?? "—"}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right align-middle">
                    {editing ? (
                      <span className="flex items-center justify-end gap-1.5">
                        <span
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]",
                            draft.splitWays > 1
                              ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                              : "border-neutral-700 bg-neutral-900 text-white/50"
                          )}
                          title="Split this bill between several people"
                        >
                          <Users size={11} />
                          <button
                            type="button"
                            onClick={() => adjustSplit(-1)}
                            disabled={draft.splitWays <= 1}
                            aria-label="Fewer people"
                            className="px-1 leading-none hover:text-white disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="tabular-nums">{draft.splitWays}</span>
                          <button
                            type="button"
                            onClick={() => adjustSplit(1)}
                            aria-label="More people"
                            className="px-1 leading-none hover:text-white"
                          >
                            +
                          </button>
                        </span>
                        <input
                          value={draft.amount}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              amount: e.target.value,
                              fullAmount:
                                Math.round(
                                  (Number(e.target.value) || 0) * draft.splitWays * 100
                                ) / 100,
                            })
                          }
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label="Amount in EUR"
                          className={cn(FIELD, "w-24 text-right")}
                        />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          t.type === "expense" ? "text-red-400" : "text-emerald-400"
                        )}
                      >
                        {t.type === "expense" ? "−" : "+"}
                        {money.format(t.amount)}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-2.5 text-right align-middle">
                    <span className="flex items-center justify-end gap-1">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEdit(t)}
                            disabled={busy}
                            aria-label="Save changes"
                            className="rounded-md p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                          >
                            {busy ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            aria-label="Cancel editing"
                            className="rounded-md p-1 text-white/40 hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            aria-label={`Edit ${t.label}`}
                            className="rounded-md p-1 text-white/30 transition-colors hover:text-white"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(t)}
                            aria-label={`Delete ${t.label}`}
                            className="rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
