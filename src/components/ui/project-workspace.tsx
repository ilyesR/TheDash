"use client";

import * as React from "react";
import { Lightbulb, Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Idea, IdeaStatus, Project } from "@/lib/transaction";

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

const STATUS_ORDER: IdeaStatus[] = ["idea", "doing", "done"];

const STATUS_STYLE: Record<IdeaStatus, { label: string; className: string }> = {
  idea: { label: "Idea", className: "border-neutral-700 bg-neutral-900 text-white/55" },
  doing: { label: "Doing", className: "border-amber-500/40 bg-amber-500/15 text-amber-300" },
  done: {
    label: "Done",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
};

/**
 * The non-financial half of a project: somewhere to think out loud, and a
 * running list of what it could become.
 */
export default function ProjectWorkspace({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <NotesPanel project={project} onSave={onSave} onError={onError} />
      <IdeasPanel project={project} onSave={onSave} onError={onError} />
    </div>
  );
}

function NotesPanel({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  // Seeded once: the parent keys this component on the project id, so opening
  // another project remounts it with fresh notes instead of carrying a draft over.
  const [draft, setDraft] = React.useState(project.notes);
  const [saving, setSaving] = React.useState(false);

  const dirty = draft !== project.notes;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave({ ...project, notes: draft });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save your notes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <NotebookPen size={15} className="text-white/50" />
          Notes
        </h2>
        {dirty && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        )}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        placeholder="Brainstorm here — context, links, open questions, anything worth remembering."
        rows={10}
        maxLength={20000}
        aria-label="Project notes"
        className={cn(FIELD, "min-h-[220px] flex-1 resize-y leading-relaxed")}
      />

      <p className="mt-2 text-[11px] text-white/30">
        {dirty ? "Unsaved — saves when you click away." : "Saved."}
      </p>
    </section>
  );
}

function IdeasPanel({
  project,
  onSave,
  onError,
}: {
  project: Project;
  onSave: (next: Project) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function commit(ideas: Idea[]) {
    setBusy(true);
    try {
      await onSave({ ...project, ideas });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save that idea.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await commit([
      ...project.ideas,
      { id: crypto.randomUUID(), text: trimmed, status: "idea" },
    ]);
  }

  /** Cycles idea → doing → done → idea, so one click moves it along. */
  function cycle(idea: Idea) {
    const next =
      STATUS_ORDER[(STATUS_ORDER.indexOf(idea.status) + 1) % STATUS_ORDER.length];
    void commit(project.ideas.map((i) => (i.id === idea.id ? { ...i, status: next } : i)));
  }

  const open = project.ideas.filter((i) => i.status !== "done").length;

  return (
    <section className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Lightbulb size={15} className="text-white/50" />
          Ideas
        </h2>
        <span className="text-[11px] text-white/35">
          {open} open · {project.ideas.length} total
        </span>
      </div>

      {project.ideas.length > 0 && (
        <ul className="mb-3 flex flex-col">
          {project.ideas.map((idea) => (
            <li
              key={idea.id}
              className="group flex items-start gap-2.5 border-b border-neutral-800/50 py-2 last:border-0"
            >
              <button
                type="button"
                onClick={() => cycle(idea)}
                disabled={busy}
                aria-label={`Idea "${idea.text}" is ${idea.status}; click to advance`}
                className={cn(
                  "mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40",
                  STATUS_STYLE[idea.status].className
                )}
              >
                {STATUS_STYLE[idea.status].label}
              </button>

              <span
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-snug",
                  idea.status === "done" ? "text-white/35 line-through" : "text-white/85"
                )}
              >
                {idea.text}
              </span>

              <button
                type="button"
                onClick={() => void commit(project.ideas.filter((i) => i.id !== idea.id))}
                disabled={busy}
                aria-label={`Delete idea "${idea.text}"`}
                className="mt-0.5 shrink-0 rounded-md p-1 text-white/20 opacity-0 transition-all hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-neutral-800 pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="What could this project do?"
          maxLength={400}
          aria-label="New idea"
          className={cn(FIELD, "flex-1")}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || text.trim() === ""}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>
    </section>
  );
}
