"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Menu,
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  Wallet,
  Link2,
  Unlink,
  Search,
} from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import CurrencyAmount from "@/components/ui/currency-amount";
import ProjectWorkspace from "@/components/ui/project-workspace";
import ProjectAds from "@/components/ui/project-ads";
import { cn } from "@/lib/utils";
import type { SupportedCurrency } from "@/lib/fx";
import type { PlannedItem, Project, Transaction } from "@/lib/transaction";
import { projectTotals } from "@/lib/transaction";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

export default function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [project, setProject] = React.useState<Project | null>(null);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/transactions"),
        ]);
        const pPayload = await pRes.json();
        const tPayload = await tRes.json();
        if (!pRes.ok) throw new Error(pPayload?.error ?? "Could not load this project.");
        if (!tRes.ok) throw new Error(tPayload?.error ?? "Could not load your transactions.");

        const found = (pPayload.projects as Project[]).find((p) => p.id === projectId);
        if (cancelled) return;

        if (!found) setNotFound(true);
        else setProject(found);
        setTransactions(tPayload.transactions);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load this project.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const totals = React.useMemo(
    () => (project ? projectTotals(project, transactions) : null),
    [project, transactions]
  );

  const attached = React.useMemo(
    () =>
      transactions
        .filter((t) => t.projectId === projectId)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, projectId]
  );

  async function save(next: Project) {
    const res = await fetch(`/api/projects/${next.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // PATCH replaces the whole document, so every field has to travel with
      // it — omitting notes or ideas here silently wiped them.
      body: JSON.stringify({
        name: next.name,
        description: next.description,
        planned: next.planned,
        notes: next.notes,
        ideas: next.ideas,
        adNotes: next.adNotes,
        adIdeas: next.adIdeas,
      }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
    setProject(payload.project as Project);
  }

  async function setTransactionProject(t: Transaction, id: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t, projectId: id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
      setTransactions((list) =>
        list.map((x) => (x.id === t.id ? (payload.transaction as Transaction) : x))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProject() {
    if (!project) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/projects");
    } catch {
      setError("Could not delete that project.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen bg-neutral-950 text-white">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 min-w-0 flex-1">
        <header className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              className="mt-1 text-white/70 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0">
              <Link
                href="/projects"
                className="mb-1 inline-flex items-center gap-1 text-[12px] text-white/45 transition-colors hover:text-white"
              >
                <ArrowLeft size={13} />
                All projects
              </Link>
              <h1 className="truncate text-xl font-semibold text-white">
                {project?.name ?? (loading ? "…" : "Project")}
              </h1>
              {project?.description && (
                <p className="text-[12px] text-white/45">{project.description}</p>
              )}
            </div>
          </div>

          {project && (
            <button
              type="button"
              onClick={removeProject}
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-2 text-[13px] text-white/50 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
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
          ) : notFound ? (
            <div className="grid place-items-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16 text-center">
              <p className="text-[13px] text-white/50">This project no longer exists.</p>
              <Link
                href="/projects"
                className="mt-3 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black"
              >
                Back to projects
              </Link>
            </div>
          ) : project && totals ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <BigStat
                  label="Spent so far"
                  value={money.format(totals.spent)}
                  tone="text-red-400"
                  icon={<TrendingDown size={15} />}
                  iconClass="bg-red-500/20 text-red-400"
                  hint={`${totals.transactions} transaction${totals.transactions === 1 ? "" : "s"}`}
                />
                <BigStat
                  label="Planned soon"
                  value={money.format(totals.planned)}
                  tone="text-amber-300"
                  icon={<CalendarClock size={15} />}
                  iconClass="bg-amber-500/20 text-amber-300"
                  hint={`${project.planned.length} item${project.planned.length === 1 ? "" : "s"} not spent yet`}
                />
                <BigStat
                  label="Brought back"
                  value={money.format(totals.earned)}
                  tone="text-emerald-400"
                  icon={<TrendingUp size={15} />}
                  iconClass="bg-emerald-500/20 text-emerald-400"
                  hint={
                    totals.spent > 0
                      ? `${Math.round((totals.earned / totals.spent) * 100)}% of what you put in`
                      : "nothing recorded yet"
                  }
                />
                <BigStat
                  label="Net result"
                  value={money.format(totals.net)}
                  tone={totals.net >= 0 ? "text-emerald-400" : "text-red-400"}
                  icon={<Wallet size={15} />}
                  iconClass="bg-violet-500/20 text-violet-400"
                  hint={
                    totals.planned > 0
                      ? `${money.format(totals.net - totals.planned)} once planned is spent`
                      : totals.net >= 0
                        ? "in profit"
                        : "still under water"
                  }
                />
              </div>

              <ProjectWorkspace
                key={project.id}
                project={project}
                onSave={save}
                onError={setError}
              />

              <ProjectAds
                key={`ads-${project.id}`}
                project={project}
                onSave={save}
                onError={setError}
              />

              <PlannedSection project={project} onSave={save} onError={setError} />

              <AttachedSection
                transactions={attached}
                busy={busy}
                onDetach={(t) => setTransactionProject(t, null)}
              />

              <AttachSection
                all={transactions}
                projectId={projectId}
                busy={busy}
                onAttach={(t) => setTransactionProject(t, projectId)}
              />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  tone,
  icon,
  iconClass,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
  iconClass: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-white/45">{label}</p>
          <p className={cn("mt-1 truncate text-2xl font-semibold tabular-nums", tone)}>
            {value}
          </p>
        </div>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", iconClass)}>
          {icon}
        </span>
      </div>
      {hint && <p className="mt-2 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

function PlannedSection({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (p: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<SupportedCurrency>("EUR");
  const [dueDate, setDueDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add() {
    const trimmed = label.trim();
    if (!trimmed || !(Number(amount) > 0)) {
      onError("A planned item needs a label and an amount.");
      return;
    }

    setBusy(true);
    try {
      // Converted on the spot so the stored figure is euros, like every total.
      let euros = Number(amount);
      if (currency !== "EUR") {
        const res = await fetch(`/api/fx?currency=${currency}`);
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "No exchange rate available.");
        euros = Math.round((Number(amount) / payload.rate.perEur) * 100) / 100;
      }

      const item: PlannedItem = {
        id: crypto.randomUUID(),
        label: trimmed,
        amount: euros,
        currency,
        originalAmount: Number(amount),
        dueDate,
      };

      await onSave({ ...project, planned: [...project.planned, item] });
      setLabel("");
      setAmount("");
      setDueDate("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add that planned item.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await onSave({ ...project, planned: project.planned.filter((p) => p.id !== id) });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove that item.");
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...project.planned].sort((a, b) => {
    // Dated items first, soonest at the top; undated fall to the bottom.
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">Planned spending</h2>
      <p className="mb-4 text-[11px] text-white/40">
        What you expect to spend on this project. Not counted as spending until it
        actually happens.
      </p>

      {sorted.length > 0 && (
        <ul className="mb-4 flex flex-col">
          {sorted.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-neutral-800/50 py-2.5 last:border-0"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
                <CalendarClock size={14} />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] text-white">{item.label}</span>
                <span className="text-[11px] text-white/35">
                  {item.dueDate ? `by ${item.dueDate}` : "no date set"}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 flex-col items-end leading-tight">
                <span className="text-[13px] font-medium tabular-nums text-amber-300">
                  {money.format(item.amount)}
                </span>
                {item.currency !== "EUR" && (
                  <span className="text-[10px] text-white/35">
                    {item.originalAmount.toFixed(2)} {item.currency}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={busy}
                aria-label={`Remove planned item ${item.label}`}
                className="shrink-0 rounded-md p-1 text-white/25 transition-colors hover:text-red-400 disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-800 pt-4">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What is coming up…"
          maxLength={120}
          aria-label="Planned item label"
          className={cn(FIELD, "min-w-[160px] flex-1")}
        />
        <div className="w-[220px]">
          <CurrencyAmount
            amount={amount}
            currency={currency}
            onAmountChange={setAmount}
            onCurrencyChange={setCurrency}
            fieldClassName={FIELD}
            label=""
          />
        </div>
        <input
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          type="date"
          aria-label="Planned item due date"
          className={cn(FIELD, "w-[150px] [color-scheme:dark]")}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Plan it
        </button>
      </div>
    </section>
  );
}

function AttachedSection({
  transactions,
  busy,
  onDetach,
}: {
  transactions: Transaction[];
  busy: boolean;
  onDetach: (t: Transaction) => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h2 className="mb-4 text-sm font-semibold text-white">
        Transactions filed here
        <span className="ml-2 text-[11px] font-normal text-white/35">
          {transactions.length}
        </span>
      </h2>

      {transactions.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-white/35">
          Nothing filed under this project yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 border-b border-neutral-800/50 py-2.5 last:border-0"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg",
                  t.type === "expense"
                    ? "bg-red-500/15 text-red-400"
                    : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                {t.type === "expense" ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] text-white">{t.label}</span>
                <span className="text-[11px] text-white/35">
                  {t.date} · {t.category}
                </span>
              </span>
              <span
                className={cn(
                  "ml-auto shrink-0 text-[13px] font-medium tabular-nums",
                  t.type === "expense" ? "text-red-400" : "text-emerald-400"
                )}
              >
                {t.type === "expense" ? "−" : "+"}
                {money.format(t.amount)}
              </span>
              <button
                type="button"
                onClick={() => onDetach(t)}
                disabled={busy}
                aria-label={`Remove ${t.label} from this project`}
                className="shrink-0 rounded-md p-1 text-white/20 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
              >
                <Unlink size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttachSection({
  all,
  projectId,
  busy,
  onAttach,
}: {
  all: Transaction[];
  projectId: string;
  busy: boolean;
  onAttach: (t: Transaction) => void;
}) {
  const [query, setQuery] = React.useState("");

  const candidates = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .filter((t) => t.projectId !== projectId)
      .filter((t) => (needle ? t.label.toLowerCase().includes(needle) : false))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8);
  }, [all, projectId, query]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h2 className="mb-1 text-sm font-semibold text-white">File an existing transaction</h2>
      <p className="mb-3 text-[11px] text-white/40">
        Search one of your transactions to attach it to this project.
      </p>

      <span className="relative block">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by label…"
          aria-label="Search transactions to attach"
          className={cn(FIELD, "pl-9")}
        />
      </span>

      {query.trim() !== "" && (
        <ul className="mt-2 flex flex-col">
          {candidates.length === 0 ? (
            <li className="py-3 text-center text-[12px] text-white/35">No match.</li>
          ) : (
            candidates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 border-b border-neutral-800/50 py-2 last:border-0"
              >
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] text-white/80">{t.label}</span>
                  <span className="text-[11px] text-white/35">
                    {t.date} · {t.category}
                    {t.projectId && " · already in another project"}
                  </span>
                </span>
                <span
                  className={cn(
                    "ml-auto shrink-0 text-[13px] tabular-nums",
                    t.type === "expense" ? "text-red-400" : "text-emerald-400"
                  )}
                >
                  {t.type === "expense" ? "−" : "+"}
                  {money.format(t.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onAttach(t)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-white/60 transition-colors hover:text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                  Attach
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}
