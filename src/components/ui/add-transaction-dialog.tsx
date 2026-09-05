"use client";

import * as React from "react";
import { X, Loader2, Sparkles, ImagePlus, Trash2, AlertCircle, Copy, Users, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { useCategories } from "@/lib/use-categories";
import type { Confidence, Participant, Transaction, TransactionType } from "@/lib/transaction";
import { formatOriginal, isForeign } from "@/lib/transaction";
import { findDuplicates } from "@/lib/dedupe";
import CurrencyAmount from "@/components/ui/currency-amount";
import type { SupportedCurrency } from "@/lib/fx";

/** Longest edge sent to the model. Bigger costs tokens without helping OCR. */
const MAX_IMAGE_EDGE = 1600;

/** Screenshots are read in parallel, but not so many that the gateway throttles. */
const SCAN_CONCURRENCY = 3;

const FIELD =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-neutral-500";

const CHIP =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-white outline-none focus:border-neutral-500";

/**
 * A screenshot can hold a whole list of transactions, so one file expands into
 * many draft rows. `scanning` and `failed` rows stand in for a file while it is
 * being read, or when nothing could be read from it.
 */
type Row =
  | { kind: "scanning"; id: string; name: string }
  | { kind: "failed"; id: string; name: string; error: string }
  | {
      kind: "draft";
      id: string;
      preview: string;
      source: string;
      confidence: Confidence;
      date: string;
      label: string;
      /** Euro value, as typed. Canonical figure that gets saved. */
      amount: string;
      currency: string;
      /** Amount in `currency`; only shown when it differs from euros. */
      originalAmount: number;
      type: TransactionType;
      category: string;
      /** Set when the user chooses to import a row flagged as a duplicate. */
      keep: boolean;
      /** People sharing this bill; 1 means not split. */
      splitWays: number;
      /** Full euro bill before dividing, kept so the share can be recomputed. */
      fullAmount: number;
      fullOriginal: number;
      /** The other people on this bill; you are not in the list. */
      participants: Participant[];
    };

type Draft = Extract<Row, { kind: "draft" }>;

async function downscaleImage(file: File): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser blocked image processing.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}

/** Runs `fn` over every item, keeping at most `limit` in flight. */
async function mapWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns why a row cannot be saved yet, or null when it is fine. */
function draftProblem(d: { label: string; amount: string; date: string }) {
  if (!d.label.trim()) return "a label";
  if (!(Number(d.amount) > 0)) return "a euro amount";
  if (!DATE_RE.test(d.date)) return "a valid date";
  return null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function imagesFrom(list: FileList | File[] | null | undefined) {
  return [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
}

export default function AddTransactionDialog({
  onClose,
  onCreated,
  existing,
}: {
  onClose: () => void;
  onCreated: (created: Transaction[]) => void;
  /** Already-saved transactions, so a re-imported screenshot is caught too. */
  existing: Transaction[];
}) {
  const { namesFor, setCategories } = useCategories();
  const [newCategory, setNewCategory] = React.useState("");
  const [addingCategory, setAddingCategory] = React.useState(false);

  /** Falls back to "Other" when the model returns a category you deleted. */
  const categoriesFor = React.useCallback(
    (type: TransactionType) => {
      const names = namesFor(type);
      return names.length > 0 ? names : ["Other"];
    },
    [namesFor]
  );

  const [rows, setRows] = React.useState<Row[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Manual entry, used only while no screenshot has been dropped.
  const [type, setType] = React.useState<TransactionType>("expense");
  const [date, setDate] = React.useState(today);
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState<string>(EXPENSE_CATEGORIES[0]);
  const [manualCurrency, setManualCurrency] = React.useState<SupportedCurrency>("EUR");
  /** How many people the bill is split between; 1 means it is all yours. */
  const [manualSplit, setManualSplit] = React.useState(1);
  const [manualParticipants, setManualParticipants] = React.useState<Participant[]>([]);

  /** The amount typed is the whole bill; your share is derived from it. */
  const manualTotal = Number(amount) || 0;
  const manualShare = Math.round((manualTotal / manualSplit) * 100) / 100;

  function adjustManualSplit(delta: number) {
    setManualSplit((ways) => {
      const next = Math.min(Math.max(ways + delta, 1), 50);
      // One name slot per other person; shrinking drops the trailing slots so
      // names already typed keep their place.
      setManualParticipants((people) =>
        Array.from(
          { length: next - 1 },
          (_, i): Participant => people[i] ?? { name: "", settled: false }
        )
      );
      return next;
    });
  }

  const labelRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => labelRef.current?.focus(), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patchDraft = React.useCallback((id: string, next: Partial<Draft>) => {
    setRows((list) =>
      list.map((r) => (r.id === id && r.kind === "draft" ? { ...r, ...next } : r))
    );
  }, []);

  /** Swaps a placeholder row for whatever the model returned for that file. */
  const replaceRow = React.useCallback((id: string, next: Row[]) => {
    setRows((list) => {
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return list;
      return [...list.slice(0, i), ...next, ...list.slice(i + 1)];
    });
  }, []);

  const addFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setError(null);

      const jobs = files.map((file) => ({ file, id: crypto.randomUUID() }));

      setRows((list) => [
        ...list,
        ...jobs.map(({ id, file }): Row => ({ kind: "scanning", id, name: file.name })),
      ]);

      await mapWithLimit(jobs, SCAN_CONCURRENCY, async ({ id, file }) => {
        try {
          const shrunk = await downscaleImage(file);
          const preview = `data:${shrunk.mediaType};base64,${shrunk.data}`;

          const res = await fetch("/api/extract-transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(shrunk),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload?.error ?? "Could not read that screenshot.");

          const found = payload.transactions as {
            date: string;
            label: string;
            amount: number;
            currency: string;
            originalAmount: number;
            type: TransactionType;
            category: string;
            confidence: Confidence;
          }[];

          replaceRow(
            id,
            found.map(
              (t): Row => ({
                kind: "draft",
                id: crypto.randomUUID(),
                preview,
                source: file.name,
                confidence: t.confidence,
                date: t.date,
                label: t.label,
                amount: t.amount > 0 ? String(t.amount) : "",
                currency: t.currency,
                originalAmount: t.originalAmount,
                type: t.type,
                category: categoriesFor(t.type).includes(t.category) ? t.category : "Other",
                keep: false,
                splitWays: 1,
                fullAmount: t.amount,
                fullOriginal: t.originalAmount,
                participants: [],
              })
            )
          );
        } catch (err) {
          replaceRow(id, [
            {
              kind: "failed",
              id,
              name: file.name,
              error: err instanceof Error ? err.message : "Could not read that screenshot.",
            },
          ]);
        }
      });
    },
    // categoriesFor changes once the saved list loads; without it, a scan
    // started early would file rows against the stale built-in list.
    [replaceRow, categoriesFor]
  );

  // Screenshots usually live on the clipboard, so accept a paste of one or many.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  // dragenter/leave fire for every child, so count depth instead of toggling.
  const dragDepth = React.useRef(0);

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void addFiles(imagesFrom(e.dataTransfer.files));
  }

  /**
   * Re-divides the stored full bill. Recomputing from `fullAmount` (rather
   * than the displayed share) keeps 3 -> 2 -> 4 ways exact instead of
   * compounding rounding errors.
   */
  function adjustSplit(id: string, delta: number) {
    // Functional update: two quick clicks must not both read the same stale
    // splitWays from the closure and land on the same number.
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id || r.kind !== "draft") return r;
        const ways = Math.min(Math.max(r.splitWays + delta, 1), 50);
        // One name slot per other person. Shrinking drops the trailing slots,
        // so names already typed keep their place.
        const slots = ways - 1;
        const participants = Array.from(
          { length: slots },
          (_, i): Participant => r.participants[i] ?? { name: "", settled: false }
        );
        return {
          ...r,
          splitWays: ways,
          amount: String(Math.round((r.fullAmount / ways) * 100) / 100),
          originalAmount: Math.round((r.fullOriginal / ways) * 100) / 100,
          participants,
        };
      })
    );
  }

  function setParticipant(id: string, index: number, next: Partial<Participant>) {
    setRows((list) =>
      list.map((r) => {
        if (r.id !== id || r.kind !== "draft") return r;
        const participants = r.participants.map((p, i) =>
          i === index ? { ...p, ...next } : p
        );
        return { ...r, participants };
      })
    );
  }

  function setDraftType(d: Draft, next: TransactionType) {
    const allowed = categoriesFor(next);
    patchDraft(d.id, {
      type: next,
      category: allowed.includes(d.category) ? d.category : allowed[0],
    });
  }

  async function post(body: unknown) {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error ?? "Could not save.");
    return payload;
  }

  async function saveDrafts() {
    if (included.length === 0) return;

    const badIndex = included.findIndex((d) => draftProblem(d) !== null);
    if (badIndex !== -1) {
      const bad = included[badIndex];
      setError(
        `Row ${badIndex + 1}${bad.label.trim() ? ` (${bad.label.trim()})` : ""} needs ${draftProblem(bad)}.`
      );
      // Jump to it: with a hundred rows, "row 112" alone is useless.
      document
        .getElementById(`draft-${bad.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // One request, one file write — even for hundreds of rows.
      const payload = await post(
        included.map((d) => ({
          date: d.date,
          label: d.label.trim(),
          amount: Number(d.amount),
          currency: d.currency,
          originalAmount: d.originalAmount,
          splitWays: d.splitWays,
          participants: d.participants.filter((p) => p.name.trim() !== ""),
          type: d.type,
          category: d.category,
        }))
      );
      onCreated(payload.transactions as Transaction[]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these transactions.");
    } finally {
      setSaving(false);
    }
  }

  /** Creates a category for the type currently selected, then selects it. */
  async function createCategory() {
    const name = newCategory.trim();
    if (!name) return;

    setAddingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: type }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Could not add that category.");

      setCategories((list) => [...list, payload.category]);
      setCategory(payload.category.name);
      setNewCategory("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that category.");
    } finally {
      setAddingCategory(false);
    }
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(Number(amount) > 0)) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!label.trim()) {
      setError("Please add a short label.");
      return;
    }

    setSaving(true);
    try {
      const payload = await post({
        date,
        label: label.trim(),
        // The server recomputes this from originalAmount when the currency is
        // not EUR, so the stored euro value always uses one agreed rate.
        // Both are your share: what you owe, not what the table owed.
        amount: manualShare,
        currency: manualCurrency,
        originalAmount: manualShare,
        convertFromOriginal: manualCurrency !== "EUR",
        splitWays: manualSplit,
        participants: manualParticipants.filter((p) => p.name.trim() !== ""),
        type,
        category,
      });
      onCreated([payload.transaction as Transaction]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the transaction.");
    } finally {
      setSaving(false);
    }
  }

  const scanning = rows.filter((r) => r.kind === "scanning").length;
  const drafts = React.useMemo(
    () => rows.filter((r): r is Draft => r.kind === "draft"),
    [rows]
  );

  // Recomputed from the live rows, so editing an amount re-evaluates the flag.
  const duplicates = React.useMemo(
    () =>
      findDuplicates(
        drafts.map((d) => ({ ...d, amount: Number(d.amount) || 0 })),
        existing
      ),
    [drafts, existing]
  );

  const included = drafts.filter((d) => d.keep || !duplicates.has(d.id));
  const skipped = drafts.length - included.length;
  const sources = new Set(drafts.map((d) => d.source)).size;
  const hasRows = rows.length > 0;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tx-title"
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col rounded-xl border bg-neutral-950 p-5 shadow-2xl transition-colors",
          hasRows ? "max-w-2xl" : "max-w-md",
          dragging ? "border-violet-500" : "border-neutral-800"
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="add-tx-title" className="text-sm font-semibold text-white">
              {hasRows
                ? `Review ${drafts.length} transaction${drafts.length === 1 ? "" : "s"}`
                : "Add transaction"}
            </h2>
            {hasRows && sources > 0 && (
              <p className="text-[11px] text-white/40">
                from {sources} screenshot{sources === 1 ? "" : "s"}
                {skipped > 0 && ` · ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`}
                {scanning > 0 && ` · ${scanning} still reading`}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-violet-500/10 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-[13px] font-medium text-violet-200">
              <ImagePlus size={16} />
              Drop your screenshots
            </p>
          </div>
        )}

        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-neutral-700 px-3 py-3 transition-colors hover:border-neutral-500",
            hasRows && "py-2.5"
          )}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = imagesFrom(e.target.files);
              // Reset so picking the same files twice still fires a change.
              e.target.value = "";
              void addFiles(files);
            }}
          />

          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-violet-300">
            {scanning > 0 ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}
          </span>

          <span className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-center gap-1.5 text-[13px] text-white">
              <Sparkles size={13} className="text-violet-300" />
              {scanning > 0 ? "Reading your screenshots…" : "Fill from screenshots"}
            </span>
            <span className="truncate text-[11px] text-white/40">
              Every transaction in each image is picked up — drop, browse or paste
            </span>
          </span>
        </label>

        {hasRows ? (
          <>
            <ul className="-mx-1 mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
              {rows.map((r) => {
                if (r.kind === "scanning") {
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
                    >
                      <Loader2 size={15} className="shrink-0 animate-spin text-white/40" />
                      <span className="truncate text-[13px] text-white/50">Reading {r.name}…</span>
                    </li>
                  );
                }

                if (r.kind === "failed") {
                  return (
                    <li
                      key={r.id}
                      className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3"
                    >
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-300" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12px] text-white/60">{r.name}</span>
                        <span className="text-[12px] text-red-300">{r.error}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                        aria-label="Dismiss this file"
                        className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                }

                const duplicate = duplicates.get(r.id);
                const muted = duplicate !== undefined && !r.keep;

                return (
                  <li
                    key={r.id}
                    id={`draft-${r.id}`}
                    className={cn(
                      "rounded-lg border p-3 transition-opacity",
                      muted
                        ? "border-neutral-800/60 bg-neutral-900/20 opacity-50"
                        : "border-neutral-800 bg-neutral-900/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.preview}
                        alt=""
                        title={r.source}
                        className="size-10 shrink-0 rounded object-cover"
                      />
                      <input
                        value={r.label}
                        onChange={(e) => patchDraft(r.id, { label: e.target.value })}
                        maxLength={120}
                        aria-label="Label"
                        className={cn(FIELD, "flex-1")}
                      />
                      <span className="relative shrink-0">
                        <input
                          value={r.amount}
                          onChange={(e) =>
                            patchDraft(r.id, {
                              amount: e.target.value,
                              // A hand-typed share redefines the bill it came from.
                              fullAmount: (Number(e.target.value) || 0) * r.splitWays,
                            })
                          }
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label="Amount in EUR"
                          className={cn(
                            FIELD,
                            "w-28 pr-6",
                            !r.amount && "border-amber-500/50"
                          )}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-white/35">
                          €
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                        aria-label="Remove this row"
                        className="shrink-0 rounded-md p-1 text-white/30 transition-colors hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
                      <button
                        type="button"
                        onClick={() => setDraftType(r, r.type === "expense" ? "income" : "expense")}
                        aria-label={`Type: ${r.type === "expense" ? "Spent" : "Received"}`}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] transition-colors",
                          r.type === "expense"
                            ? "border-red-500/40 bg-red-500/15 text-red-300"
                            : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        )}
                      >
                        {r.type === "expense" ? "Spent" : "Received"}
                      </button>

                      <select
                        value={r.category}
                        onChange={(e) => patchDraft(r.id, { category: e.target.value })}
                        aria-label="Category"
                        className={CHIP}
                      >
                        {categoriesFor(r.type).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      <input
                        value={r.date}
                        onChange={(e) => patchDraft(r.id, { date: e.target.value })}
                        type="date"
                        aria-label="Date"
                        className={cn(
                          CHIP,
                          "[color-scheme:dark]",
                          !DATE_RE.test(r.date) && "border-amber-500/50"
                        )}
                      />

                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] transition-colors",
                          r.splitWays > 1
                            ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                            : "border-neutral-700 bg-neutral-900 text-white/50"
                        )}
                        title="Split this bill between several people"
                      >
                        <Users size={11} />
                        <button
                          type="button"
                          onClick={() => adjustSplit(r.id, -1)}
                          disabled={r.splitWays <= 1}
                          aria-label="Fewer people"
                          className="px-1 leading-none transition-opacity hover:text-white disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="tabular-nums">{r.splitWays}</span>
                        <button
                          type="button"
                          onClick={() => adjustSplit(r.id, 1)}
                          aria-label="More people"
                          className="px-1 leading-none transition-opacity hover:text-white"
                        >
                          +
                        </button>
                      </span>

                      {r.splitWays > 1 && (
                        <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200">
                          your share of €{r.fullAmount.toFixed(2)}
                        </span>
                      )}
                      {isForeign(r) && (
                        <span
                          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-white/60"
                          title="Amount actually charged"
                        >
                          paid {formatOriginal(r)}
                        </span>
                      )}

                      {!r.amount && (
                        <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                          no euro amount in the image — enter it
                        </span>
                      )}

                      {!DATE_RE.test(r.date) && (
                        <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                          date unreadable — pick one
                        </span>
                      )}

                      {r.confidence !== "high" && !muted && (
                        <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                          {r.confidence} confidence — check this row
                        </span>
                      )}

                      {duplicate !== undefined && (
                        <span className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-300">
                            <Copy size={11} />
                            {duplicate === "saved" ? "Already saved" : "Repeated in this batch"}
                          </span>
                          <button
                            type="button"
                            onClick={() => patchDraft(r.id, { keep: !r.keep })}
                            className="rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-white/60 transition-colors hover:text-white"
                          >
                            {r.keep ? "Skip it" : "Import anyway"}
                          </button>
                        </span>
                      )}
                    </div>

                    {r.splitWays > 1 && (
                      <div className="mt-2 flex flex-col gap-1.5 pl-[52px]">
                        <span className="text-[11px] text-white/35">
                          Who paid with you? Each owes €{(Number(r.amount) || 0).toFixed(2)}.
                        </span>
                        {r.participants.map((person, i) => (
                          <span key={i} className="flex items-center gap-2">
                            <input
                              value={person.name}
                              onChange={(e) =>
                                setParticipant(r.id, i, { name: e.target.value })
                              }
                              placeholder={`Person ${i + 1}`}
                              maxLength={60}
                              aria-label={`Name of person ${i + 1}`}
                              className={cn(CHIP, "w-40")}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setParticipant(r.id, i, { settled: !person.settled })
                              }
                              disabled={person.name.trim() === ""}
                              aria-pressed={person.settled}
                              className={cn(
                                "rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40",
                                person.settled
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                              )}
                            >
                              {person.settled ? "paid me back" : "still owes me"}
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                  </li>
                );
              })}
            </ul>

            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setError(null);
                }}
                className="rounded-lg px-3 py-2 text-[13px] text-white/60 transition-colors hover:text-white"
              >
                Clear all
              </button>

              <button
                type="button"
                onClick={saveDrafts}
                disabled={saving || scanning > 0 || included.length === 0}
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Saving…" : `Save ${included.length}`}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitManual} className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setCategory(categoriesFor(t)[0]);
                  }}
                  aria-pressed={type === t}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[13px] transition-colors",
                    type === t
                      ? t === "expense"
                        ? "border-red-500/40 bg-red-500/15 text-red-300"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-neutral-800 bg-neutral-900 text-white/50 hover:text-white"
                  )}
                >
                  {t === "expense" ? "Spent" : "Received"}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-white/50">Label</span>
              <input
                ref={labelRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Rent, client invoice, groceries…"
                maxLength={120}
                className={FIELD}
              />
            </label>

            <CurrencyAmount
              amount={amount}
              currency={manualCurrency}
              onAmountChange={setAmount}
              onCurrencyChange={setManualCurrency}
              fieldClassName={FIELD}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-white/50">Split the bill</span>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[13px] transition-colors",
                    manualSplit > 1
                      ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                      : "border-neutral-700 bg-neutral-900 text-white/50"
                  )}
                >
                  <Users size={13} />
                  <button
                    type="button"
                    onClick={() => adjustManualSplit(-1)}
                    disabled={manualSplit <= 1}
                    aria-label="Fewer people"
                    className="px-1.5 leading-none transition-opacity hover:text-white disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="tabular-nums">{manualSplit}</span>
                  <button
                    type="button"
                    onClick={() => adjustManualSplit(1)}
                    aria-label="More people"
                    className="px-1.5 leading-none transition-opacity hover:text-white"
                  >
                    +
                  </button>
                </span>

                <span className="text-[11px] text-white/35">
                  {manualSplit === 1
                    ? "All yours."
                    : `Your share: ${manualShare.toFixed(2)} of ${manualTotal.toFixed(2)} ${manualCurrency}.`}
                </span>
              </div>

              {manualSplit > 1 && (
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="text-[11px] text-white/35">
                    Who paid with you? Each owes {manualShare.toFixed(2)}{" "}
                    {manualCurrency}.
                  </span>
                  {manualParticipants.map((person, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <input
                        value={person.name}
                        onChange={(e) =>
                          setManualParticipants((people) =>
                            people.map((p, j) =>
                              j === i ? { ...p, name: e.target.value } : p
                            )
                          )
                        }
                        placeholder={`Person ${i + 1}`}
                        maxLength={60}
                        aria-label={`Name of person ${i + 1}`}
                        className={cn(FIELD, "flex-1 py-1.5 text-[12px]")}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setManualParticipants((people) =>
                            people.map((p, j) =>
                              j === i ? { ...p, settled: !p.settled } : p
                            )
                          )
                        }
                        disabled={person.name.trim() === ""}
                        aria-pressed={person.settled}
                        className={cn(
                          "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-40",
                          person.settled
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        )}
                      >
                        {person.settled ? "paid me back" : "still owes me"}
                      </button>
                    </span>
                  ))}
                  <span className="text-[11px] text-white/25">
                    Leave a name blank to skip it. Anyone still owing you shows up
                    on the Pay back tab.
                  </span>
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-white/50">Date</span>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                type="date"
                className={cn(FIELD, "[color-scheme:dark]")}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-white/50">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
                className={FIELD}
              >
                {categoriesFor(type).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter would otherwise submit the whole transaction form.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createCategory();
                    }
                  }}
                  placeholder="New category…"
                  maxLength={60}
                  aria-label="New category name"
                  className={cn(FIELD, "flex-1 py-1.5 text-[12px]")}
                />
                <button
                  type="button"
                  onClick={() => void createCategory()}
                  disabled={addingCategory || newCategory.trim() === ""}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[12px] text-white/70 transition-colors hover:text-white disabled:opacity-40"
                >
                  {addingCategory ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Add
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
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
        )}
      </div>
    </div>
  );
}
