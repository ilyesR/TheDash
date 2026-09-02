"use client";

import * as React from "react";
import { Menu, Plus, Loader2 } from "lucide-react";

import AppSidebar from "@/components/ui/app-sidebar";
import TransactionsTable from "@/components/ui/transactions-table";
import AddTransactionDialog from "@/components/ui/add-transaction-dialog";
import type { Transaction } from "@/lib/transaction";

export default function TransactionsView() {
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your transactions.");
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
              <h1 className="text-xl font-semibold text-white">Transactions</h1>
              <p className="text-[12px] text-white/45">
                Every entry, with search, filters and inline editing.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-black transition-colors hover:bg-white/90"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Add transaction</span>
          </button>
        </header>

        <main className="px-6 pb-10">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-300"
            >
              {error}
            </p>
          )}

          {loading ? (
            <p className="flex items-center gap-2 py-10 text-[13px] text-white/40">
              <Loader2 size={15} className="animate-spin" />
              Loading your transactions…
            </p>
          ) : (
            <TransactionsTable transactions={transactions} onChanged={setTransactions} />
          )}
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
