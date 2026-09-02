import type { TransactionType } from "@/lib/transaction";

export type DuplicateKind = "batch" | "saved";

type Comparable = {
  date: string;
  label: string;
  amount: number;
  type: TransactionType;
};

/**
 * Two screenshots of the same account often overlap, so the same row can be
 * read twice. Labels come back with inconsistent casing, accents and
 * punctuation ("CARREFOUR MARKET" vs "Carrefour Market"), so compare on a
 * flattened form. Category is deliberately excluded: the model may file the
 * same transaction differently, but it is still the same transaction.
 */
function normaliseLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function transactionKey(t: Comparable) {
  return [t.date, t.type, t.amount.toFixed(2), normaliseLabel(t.label)].join("|");
}

/**
 * Flags each candidate that repeats an earlier candidate or an already-saved
 * transaction. The first occurrence is never flagged, so a genuine pair of
 * identical purchases still keeps one entry.
 */
export function findDuplicates<T extends Comparable & { id: string }>(
  candidates: T[],
  saved: Comparable[]
): Map<string, DuplicateKind> {
  const savedKeys = new Set(saved.map(transactionKey));
  const seen = new Set<string>();
  const flags = new Map<string, DuplicateKind>();

  for (const candidate of candidates) {
    const key = transactionKey(candidate);
    if (seen.has(key)) flags.set(candidate.id, "batch");
    else if (savedKeys.has(key)) flags.set(candidate.id, "saved");
    else seen.add(key);
  }

  return flags;
}
