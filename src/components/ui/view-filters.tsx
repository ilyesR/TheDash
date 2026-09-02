"use client";

import * as React from "react";
import { Bell, Check, Loader2, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { useCategories, type Category } from "@/lib/use-categories";
import { useHalalMode } from "@/lib/use-halal";

/** Where the "recent" period starts. One place to change it. */
export const PERIOD_START = "2026-09-01";

export type Period = "all" | "recent";

/**
 * Bell menu holding the halal filter and the list of categories it hides.
 * Nothing here deletes data: both controls only change what is displayed.
 */
export default function ViewFilters({
  period,
  onPeriodChange,
}: {
  period: Period;
  onPeriodChange: (next: Period) => void;
}) {
  const { enabled: halal, toggle: toggleHalal } = useHalalMode();
  const { categories, setCategories } = useCategories();

  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const flagged = categories.filter((c) => c.haram);

  async function toggleCategory(category: Category) {
    setBusy(category.id);
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ haram: !category.haram }),
      });
      if (!res.ok) throw new Error();
      setCategories((list) =>
        list.map((c) => (c.id === category.id ? { ...c, haram: !c.haram } : c))
      );
    } catch {
      // Leave the flag as it was; the row simply does not move.
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/70 p-0.5">
        {(
          [
            { key: "all" as const, label: "All time" },
            { key: "recent" as const, label: "Since 1 Sep" },
          ]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onPeriodChange(key)}
            aria-pressed={period === key}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
              period === key
                ? "bg-neutral-800 text-white"
                : "text-white/50 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="View filters"
          className={cn(
            "relative rounded-lg p-2 transition-colors",
            halal ? "text-emerald-400" : "text-white/60 hover:text-white"
          )}
        >
          <Bell size={18} />
          <span
            className={cn(
              "absolute right-1.5 top-1.5 size-1.5 rounded-full",
              halal ? "bg-emerald-400" : "bg-red-500"
            )}
          />
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <button
              type="button"
              onClick={toggleHalal}
              aria-pressed={halal}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                halal
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg",
                  halal ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-white/40"
                )}
              >
                <ShieldCheck size={16} />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="text-[13px] font-medium text-white">Halal mode</span>
                <span className="text-[11px] text-white/45">
                  {halal
                    ? `Hiding ${flagged.length} categor${flagged.length === 1 ? "y" : "ies"}`
                    : "Hide the categories marked below"}
                </span>
              </span>
            </button>

            <p className="mt-3 text-[11px] text-white/35">
              Nothing is deleted — these transactions are only hidden from totals and
              charts, and come back when you switch this off.
            </p>

            <div className="mt-3 border-t border-neutral-800 pt-3">
              <p className="mb-2 text-[11px] font-medium text-white/60">
                Categories to hide
              </p>
              <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto">
                {categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => void toggleCategory(category)}
                      disabled={busy !== null}
                      aria-pressed={category.haram}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-900 disabled:opacity-50"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded border",
                          category.haram
                            ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                            : "border-neutral-700"
                        )}
                      >
                        {busy === category.id ? (
                          <Loader2 size={9} className="animate-spin" />
                        ) : category.haram ? (
                          <Check size={10} />
                        ) : null}
                      </span>
                      <span className="truncate text-[12px] text-white/75">
                        {category.name}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] text-white/25">
                        {category.kind === "expense" ? "spent" : "received"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
