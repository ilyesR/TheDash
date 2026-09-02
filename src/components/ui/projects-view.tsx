"use client";

import * as React from "react";
import Link from "next/link";
import {
  Menu,
  Loader2,
  Plus,
  X,
  FolderKanban,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  CalendarClock,
} from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import { cn } from "@/lib/utils";
import type { Project, Transaction } from "@/lib/transaction";
import { projectTotals } from "@/lib/transaction";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

export default function ProjectsView() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

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
        if (!pRes.ok) throw new Error(pPayload?.error ?? "Could not load your projects.");
        if (!tRes.ok) throw new Error(tPayload?.error ?? "Could not load your transactions.");
        if (!cancelled) {
          setProjects(pPayload.projects);
          setTransactions(tPayload.transactions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your projects.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
              <h1 className="text-xl font-semibold text-white">Projects</h1>
              <p className="text-[12px] text-white/45">
                Ideas, notes and money — one place per project.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">New project</span>
          </button>
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
          ) : projects.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-neutral-800 bg-neutral-900/50 py-16 text-center">
              <FolderKanban size={22} className="mb-3 text-white/25" />
              <p className="text-[13px] text-white/50">No project yet.</p>
              <p className="mt-1 max-w-[340px] text-[12px] text-white/30">
                Create one, then file transactions under it to see what it cost and what
                it earned.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {projects.map((project) => {
                const totals = projectTotals(project, transactions);

                return (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="group flex h-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-600 hover:bg-neutral-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[15px] font-medium text-white">
                            {project.name}
                          </span>
                          <span className="truncate text-[11px] text-white/40">
                            {totals.transactions} transaction
                            {totals.transactions === 1 ? "" : "s"}
                            {project.description && ` · ${project.description}`}
                          </span>
                        </span>
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60"
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <MiniStat
                          label="Spent"
                          value={money.format(totals.spent)}
                          tone="text-red-400"
                          icon={<TrendingDown size={10} />}
                        />
                        <MiniStat
                          label="Planned"
                          value={money.format(totals.planned)}
                          tone="text-amber-300"
                          icon={<CalendarClock size={10} />}
                        />
                        <MiniStat
                          label="Brought back"
                          value={money.format(totals.earned)}
                          tone="text-emerald-400"
                          icon={<TrendingUp size={10} />}
                        />
                      </div>

                      <p className="mt-3 border-t border-neutral-800 pt-2 text-[11px] text-white/40">
                        Net{" "}
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            totals.net >= 0 ? "text-emerald-400" : "text-red-400"
                          )}
                        >
                          {money.format(totals.net)}
                        </span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => setProjects((list) => [...list, project])}
        />
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-2">
      <span className="flex items-center gap-1 text-[10px] text-white/40">
        {icon}
        {label}
      </span>
      <p className={cn("mt-0.5 truncate text-[13px] font-semibold tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nameRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => nameRef.current?.focus(), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("A project name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          planned: [],
          notes: "",
          ideas: [],
          adNotes: "",
          adIdeas: [],
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not save that project.");
      onCreated(payload.project as Project);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that project.");
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
        aria-labelledby="new-project-title"
        className="relative w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-project-title" className="text-sm font-semibold text-white">
            New project
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

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Name</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Side business, flat renovation…"
              maxLength={80}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-white/50">Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this is about"
              maxLength={400}
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
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
