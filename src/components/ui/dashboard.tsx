"use client";

import * as React from "react";
import {
  Search,
  Menu,
  LineChart,
  Plus,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/transaction";
import { formatOriginal, isForeign } from "@/lib/transaction";
import AddTransactionDialog from "@/components/ui/add-transaction-dialog";
import AppSidebar from "@/components/ui/app-sidebar";
import ViewFilters, { PERIOD_START, type Period } from "@/components/ui/view-filters";
import { useCategories } from "@/lib/use-categories";
import { haramNames, useHalalMode } from "@/lib/use-halal";

/** Change this (and the locale below) to switch the whole dashboard's currency. */
const CURRENCY = "EUR";
const LOCALE = "en-US";

const money = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

const moneyCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const EXPENSE_COLORS = [
  "#f87171", "#fbbf24", "#fb923c", "#a78bfa", "#f472b6", "#60a5fa", "#9ca3af",
];

const INCOME_COLORS = [
  "#34d399", "#22d3ee", "#4ade80", "#2dd4bf", "#a3e635", "#38bdf8", "#9ca3af",
];

type MonthAgg = { key: string; label: string; income: number; expense: number };

// ---------------------------------------------------------------- aggregation

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year.slice(2)}`;
}

function nextMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Buckets transactions by month, filling gap months with zeros so the chart's
 * x-axis stays evenly spaced. Capped to the most recent 12 months.
 */
function aggregateByMonth(transactions: Transaction[]): MonthAgg[] {
  if (transactions.length === 0) return [];

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    const key = monthKey(t.date);
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    bucket[t.type] += t.amount;
    buckets.set(key, bucket);
  }

  const keys = [...buckets.keys()].sort();
  const filled: MonthAgg[] = [];
  for (let key = keys[0]; key <= keys[keys.length - 1]; key = nextMonth(key)) {
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    filled.push({ key, label: monthLabel(key), ...bucket });
  }

  return filled.slice(-12);
}

function aggregateByCategory(transactions: Transaction[], kind: Transaction["type"]) {
  const buckets = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== kind) continue;
    buckets.set(t.category, (buckets.get(t.category) ?? 0) + t.amount);
  }
  const total = [...buckets.values()].reduce((sum, v) => sum + v, 0);
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      share: total === 0 ? 0 : (value / total) * 100,
      color: (kind === "expense" ? EXPENSE_COLORS : INCOME_COLORS)[
        i % EXPENSE_COLORS.length
      ],
    }));
}

// -------------------------------------------------------------------- charts

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-[240px] place-items-center text-center">
      <p className="max-w-[220px] text-[12px] text-white/35">{message}</p>
    </div>
  );
}

function CashflowChart({ months }: { months: MonthAgg[] }) {
  const width = 520;
  const height = 240;
  const padLeft = 44;
  const padBottom = 28;
  const padTop = 12;

  const plotW = width - padLeft;
  const plotH = height - padBottom - padTop;

  const peak = Math.max(...months.flatMap((m) => [m.income, m.expense]), 0);
  // Round the axis up to a clean power-of-ten step so labels read nicely.
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(peak || 1)) - 1)) * 5;
  const maxY = peak === 0 ? 100 : Math.ceil(peak / step) * step;

  // A single month has no span to interpolate across, so pin it mid-plot.
  const stepX = months.length > 1 ? plotW / (months.length - 1) : 0;
  const xAt = (i: number) => (months.length > 1 ? padLeft + i * stepX : padLeft + plotW / 2);
  const yAt = (v: number) => padTop + plotH - (v / maxY) * plotH;

  const pathFor = (pick: (m: MonthAgg) => number) =>
    months.map((m, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(pick(m)).toFixed(1)}`).join(" ");

  const series = [
    { key: "income" as const, color: "#34d399", pick: (m: MonthAgg) => m.income },
    { key: "expense" as const, color: "#f87171", pick: (m: MonthAgg) => m.expense },
  ];

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => r * maxY);

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[240px]" role="img" aria-label="Income versus expenses by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} y1={yAt(t)} x2={width} y2={yAt(t)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padLeft - 8} y={yAt(t) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">
              {moneyCompact.format(t)}
            </text>
          </g>
        ))}

        {series.map(({ key, color, pick }) => (
          <path key={key} d={pathFor(pick)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {months.map((m, i) => (
          <g key={m.key}>
            {series.map(({ key, color, pick }) => (
              <circle key={key} cx={xAt(i)} cy={yAt(pick(m))} r="3.5" fill={color} />
            ))}
            <text x={xAt(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
              {m.label}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex items-center justify-center gap-4">
        {[
          { label: "Received", color: "#34d399" },
          { label: "Spent", color: "#f87171" },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-white/50">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

/** Walks the segments once to turn shares into cumulative arc offsets. */
function toArcs(
  segments: ReturnType<typeof aggregateByCategory>,
  circumference: number,
  gap: number
) {
  let cursor = 0;
  return segments.map((seg) => {
    const len = (seg.share / 100) * circumference;
    const arc = { ...seg, offset: cursor, visible: Math.max(len - gap, 0) };
    cursor += len;
    return arc;
  });
}

function CategoryDonut({
  segments,
  title,
}: {
  segments: ReturnType<typeof aggregateByCategory>;
  title: string;
}) {
  const size = 200;
  const r = 66;
  const stroke = 24;
  const circumference = 2 * Math.PI * r;
  const gap = 2;

  const arcs = toArcs(segments, circumference, gap);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="size-[200px] shrink-0 -rotate-90" role="img" aria-label={title}>
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={stroke}
            strokeDasharray={`${arc.visible} ${circumference - arc.visible}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>

      <ul className="flex w-full flex-col gap-1.5 sm:w-auto sm:min-w-[150px]">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-[12px]">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="truncate text-white/70">{seg.label}</span>
            <span className="ml-auto shrink-0 text-white/40">{seg.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------- panels

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-neutral-800 bg-neutral-900/50 p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}



// ------------------------------------------------------------------ dashboard

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/transactions");
        const payload = await res.json();
        // Surface the server's reason (e.g. Firebase not configured) instead of
        // a generic message the user cannot act on.
        if (!res.ok) throw new Error(payload?.error ?? "Could not load your transactions.");
        if (!cancelled) setTransactions(payload.transactions);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { enabled: halal } = useHalalMode();
  const { categories: allCategories } = useCategories();
  const [period, setPeriod] = React.useState<Period>("all");

  /**
   * One filtered list drives every panel, so a hidden category can never leak
   * into a total while staying out of a chart.
   */
  const visible = React.useMemo(() => {
    const hidden = haramNames(allCategories);
    return transactions.filter((t) => {
      if (period === "recent" && t.date < PERIOD_START) return false;
      if (halal && hidden.has(t.category.toLowerCase())) return false;
      return true;
    });
  }, [transactions, allCategories, halal, period]);

  const hiddenCount = transactions.length - visible.length;

  const months = React.useMemo(() => aggregateByMonth(visible), [visible]);
  const spendingByCategory = React.useMemo(
    () => aggregateByCategory(visible, "expense"),
    [visible]
  );
  const incomeByCategory = React.useMemo(
    () => aggregateByCategory(visible, "income"),
    [visible]
  );

  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of visible) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    const current = months.at(-1);
    return { income, expense, net: income - expense, currentNet: current ? current.income - current.expense : 0, currentLabel: current?.label };
  }, [visible, months]);

  async function remove(id: string) {
    const previous = transactions;
    setTransactions((list) => list.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTransactions(previous);
      setError("Could not delete that transaction.");
    }
  }

  const stats = [
    {
      label: "Total received",
      value: money.format(totals.income),
      hint: `${visible.filter((t) => t.type === "income").length} entries`,
      positive: true,
      icon: ArrowDownLeft,
      iconClass: "bg-emerald-500/20 text-emerald-400",
    },
    {
      label: "Total spent",
      value: money.format(totals.expense),
      hint: `${visible.filter((t) => t.type === "expense").length} entries`,
      positive: false,
      icon: ArrowUpRight,
      iconClass: "bg-red-500/20 text-red-400",
    },
    {
      label: "Net balance",
      value: money.format(totals.net),
      hint: totals.net >= 0 ? "You are in the green" : "You are running a deficit",
      positive: totals.net >= 0,
      icon: Wallet,
      iconClass: "bg-violet-500/20 text-violet-400",
    },
    {
      label: "Latest month",
      value: money.format(totals.currentNet),
      hint: totals.currentLabel ? `Net for ${totals.currentLabel}` : "No data yet",
      positive: totals.currentNet >= 0,
      icon: LineChart,
      iconClass: "bg-amber-500/20 text-amber-400",
    },
  ];

  return (
    <div className="relative flex min-h-screen bg-neutral-950 text-white">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="md:hidden text-white/70"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Dashboard</h1>
              <p className="text-[12px] text-white/45">Your real income and spending, month by month.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden w-56 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-[13px] text-white/35 lg:flex">
              <Search size={15} />
              <span>Search...</span>
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Add transaction</span>
            </button>
            <ViewFilters period={period} onPeriodChange={setPeriod} />
          </div>
        </header>

        <main className="flex flex-col gap-4 px-6 pb-8">
          {error && (
            <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              {error}
            </p>
          )}

          {hiddenCount > 0 && (
            <p className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2 text-[12px] text-white/45">
              {hiddenCount} transaction{hiddenCount === 1 ? "" : "s"} hidden by your
              filters — still saved, just not counted here.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, hint, positive, icon: Icon, iconClass }) => (
              <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-white/45">{label}</p>
                    <p className="mt-1 truncate text-2xl font-semibold text-white">
                      {loading ? "—" : value}
                    </p>
                  </div>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", iconClass)}>
                    <Icon size={17} />
                  </span>
                </div>
                <p className={cn("mt-2 text-[11px]", positive ? "text-emerald-400" : "text-red-400")}>
                  {loading ? "Loading…" : hint}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Received vs Spent">
              {loading ? (
                <EmptyState message="Loading your data…" />
              ) : months.length === 0 ? (
                <EmptyState message="No transactions yet. Add your first one to see the trend build up." />
              ) : (
                <CashflowChart months={months} />
              )}
            </Panel>

            <Panel title="Spending by category">
              {loading ? (
                <EmptyState message="Loading your data…" />
              ) : spendingByCategory.length === 0 ? (
                <EmptyState message="No spending recorded yet." />
              ) : (
                <CategoryDonut segments={spendingByCategory} title="Spending by category" />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Income by category">
              {loading ? (
                <EmptyState message="Loading your data…" />
              ) : incomeByCategory.length === 0 ? (
                <EmptyState message="Nothing received yet." />
              ) : (
                <CategoryDonut segments={incomeByCategory} title="Income by category" />
              )}
            </Panel>

            <Panel title="Where your money comes from">
              {loading ? (
                <EmptyState message="Loading your data…" />
              ) : incomeByCategory.length === 0 ? (
                <EmptyState message="Nothing received yet." />
              ) : (
                <ul className="flex flex-col gap-2 py-2">
                  {incomeByCategory.map((seg) => (
                    <li key={seg.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-[12px] text-white/70">
                        {seg.label}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${seg.share}%`, backgroundColor: seg.color }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-white/60">
                        {money.format(seg.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Recent transactions">
              {loading ? (
                <p className="py-6 text-center text-[12px] text-white/35">Loading…</p>
              ) : visible.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-white/35">Nothing to show with these filters.</p>
              ) : (
                <ul className="flex flex-col">
                  {visible.slice(0, 6).map((t) => (
                    <li key={t.id} className="group flex items-center gap-3 border-b border-neutral-800/70 py-3 last:border-0 last:pb-0">
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg",
                          t.type === "income" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}
                      >
                        {t.type === "income" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[13px] text-white">{t.label}</span>
                        <span className="truncate text-[11px] text-white/40">
                          {t.category} · {t.date}
                          {isForeign(t) && " · " + formatOriginal(t)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "ml-auto shrink-0 text-[13px] font-medium tabular-nums",
                          t.type === "income" ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {money.format(t.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        aria-label={`Delete ${t.label}`}
                        className="shrink-0 rounded-md p-1 text-white/25 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Monthly breakdown">
              {loading ? (
                <p className="py-6 text-center text-[12px] text-white/35">Loading…</p>
              ) : months.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-white/35">Nothing recorded yet.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-neutral-800 text-left text-[11px] text-white/40">
                        <th className="px-1 py-2 font-normal">Month</th>
                        <th className="px-1 py-2 text-right font-normal">Received</th>
                        <th className="px-1 py-2 text-right font-normal">Spent</th>
                        <th className="px-1 py-2 text-right font-normal">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...months].reverse().map((m) => {
                        const net = m.income - m.expense;
                        return (
                          <tr key={m.key} className="border-b border-neutral-800/50 last:border-0">
                            <td className="px-1 py-2.5 text-white/80">{m.label}</td>
                            <td className="px-1 py-2.5 text-right tabular-nums text-emerald-400">{money.format(m.income)}</td>
                            <td className="px-1 py-2.5 text-right tabular-nums text-red-400">{money.format(m.expense)}</td>
                            <td className={cn("px-1 py-2.5 text-right font-medium tabular-nums", net >= 0 ? "text-white" : "text-red-400")}>
                              {money.format(net)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </main>
      </div>

      {dialogOpen && (
        <AddTransactionDialog
          onClose={() => setDialogOpen(false)}
          onCreated={(created) => setTransactions((list) => [...created, ...list])}
          existing={transactions}
        />
      )}
    </div>
  );
}
