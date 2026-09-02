"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/fx";

const eur = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/**
 * Amount field paired with a currency picker. Whatever you type, the euro
 * value that will actually be stored is shown underneath, so nothing is
 * converted behind your back.
 */
export default function CurrencyAmount({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  fieldClassName,
  label = "Amount",
}: {
  amount: string;
  currency: SupportedCurrency;
  onAmountChange: (next: string) => void;
  onCurrencyChange: (next: SupportedCurrency) => void;
  fieldClassName: string;
  label?: string;
}) {
  // Keyed by currency: a missing key means "still fetching", a null value
  // means the lookup failed. Deriving both from one map avoids driving state
  // from inside the effect.
  const [rates, setRates] = React.useState<Record<string, number | null>>({ EUR: 1 });

  React.useEffect(() => {
    if (currency in rates) return;

    let cancelled = false;
    (async () => {
      let value: number | null = null;
      try {
        const res = await fetch(`/api/fx?currency=${currency}`);
        const payload = await res.json();
        if (res.ok && Number(payload?.rate?.perEur) > 0) {
          value = Number(payload.rate.perEur);
        }
      } catch {
        // Leave value null; the field falls back to asking for euros.
      }
      if (!cancelled) setRates((current) => ({ ...current, [currency]: value }));
    })();

    return () => {
      cancelled = true;
    };
  }, [currency, rates]);

  const rate = rates[currency];
  const loading = !(currency in rates);
  const failed = rate === null;

  const typed = Number(amount);
  const converted =
    rate && Number.isFinite(typed) && typed > 0
      ? Math.round((typed / rate) * 100) / 100
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      {label.trim() !== "" && (
        <span className="text-[12px] text-white/50">{label}</span>
      )}

      <div className="flex items-stretch gap-2">
        <input
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          // label can be blank when the field sits under its own heading;
          // never let the accessible name collapse to just " in AED".
          aria-label={`${label.trim() || "Amount"} in ${currency}`}
          className={cn(fieldClassName, "flex-1")}
        />
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value as SupportedCurrency)}
          aria-label="Currency"
          className={cn(fieldClassName, "w-[86px] shrink-0")}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {currency !== "EUR" && (
        <span
          data-testid="fx-hint"
          className={cn("text-[11px]", failed ? "text-amber-300" : "text-white/40")}
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Fetching today&apos;s rate…
            </span>
          ) : failed ? (
            "No rate available — switch to EUR and enter the euro amount."
          ) : converted !== null ? (
            `= ${eur.format(converted)} · 1 EUR = ${rate.toFixed(4)} ${currency}`
          ) : (
            `1 EUR = ${rate?.toFixed(4)} ${currency}`
          )}
        </span>
      )}
    </div>
  );
}
