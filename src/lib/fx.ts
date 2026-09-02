/**
 * Exchange rates for manual entry.
 *
 * Screenshots already carry their own euro equivalent and must never be
 * converted here — this is only for amounts you type in yourself.
 */

/** Currencies offered in the manual forms. EUR must stay first. */
export const SUPPORTED_CURRENCIES = ["EUR", "AED"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

export class RateUnavailableError extends Error {
  constructor(currency: string) {
    super(
      `No exchange rate available for ${currency}. Enter the euro amount directly, or set FX_RATE_${currency} in .env.local.`
    );
    this.name = "RateUnavailableError";
  }
}

export type Rate = {
  currency: string;
  /** Units of `currency` per 1 EUR, e.g. 4.28 AED. */
  perEur: number;
  /** ISO timestamp of when this rate was fetched. */
  fetchedAt: string;
  source: string;
};

/** Rates move slowly enough that a half-day cache is plenty. */
const TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { rate: Rate; at: number }>();

type Source = { name: string; url: string; read: (json: unknown, code: string) => number | null };

// The ECB feed does not publish AED, so these general providers are used
// instead. The second is a fallback for when the first is unreachable.
const SOURCES: Source[] = [
  {
    name: "open.er-api.com",
    url: "https://open.er-api.com/v6/latest/EUR",
    read: (json, code) => {
      const rates = (json as { rates?: Record<string, number> }).rates;
      return rates?.[code] ?? null;
    },
  },
  {
    name: "currency-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json",
    read: (json, code) => {
      const rates = (json as { eur?: Record<string, number> }).eur;
      return rates?.[code.toLowerCase()] ?? null;
    },
  },
];

/** A pinned rate wins over the network, for offline use or a fixed budget rate. */
function pinnedRate(code: string): number | null {
  const raw = process.env[`FX_RATE_${code}`];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getRate(currency: string): Promise<Rate> {
  const code = currency.toUpperCase();

  if (code === "EUR") {
    return { currency: "EUR", perEur: 1, fetchedAt: new Date().toISOString(), source: "fixed" };
  }

  const pinned = pinnedRate(code);
  if (pinned) {
    return {
      currency: code,
      perEur: pinned,
      fetchedAt: new Date().toISOString(),
      source: `FX_RATE_${code}`,
    };
  }

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const value = source.read(await res.json(), code);
      if (!value || !Number.isFinite(value) || value <= 0) continue;

      const rate: Rate = {
        currency: code,
        perEur: value,
        fetchedAt: new Date().toISOString(),
        source: source.name,
      };
      cache.set(code, { rate, at: Date.now() });
      return rate;
    } catch {
      // Try the next source rather than failing on one provider's outage.
    }
  }

  // A stale rate beats no rate: better a day-old number than a blocked entry.
  if (hit) return hit.rate;

  throw new RateUnavailableError(code);
}

/** Converts an amount in `currency` into euros, rounded to cents. */
export async function toEur(amount: number, currency: string): Promise<number> {
  const { perEur } = await getRate(currency);
  return Math.round((amount / perEur) * 100) / 100;
}
