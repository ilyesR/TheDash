import { addTransactions, listTransactions, parseNewTransaction } from "@/lib/finance";
import type { NewTransaction } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";
import { RateUnavailableError, toEur } from "@/lib/fx";

/** Turns a missing/broken Firebase setup into an explanation, not a 500. */
function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

/** Guards against a runaway import flooding the JSON file in one request. */
const MAX_BATCH = 500;

export async function GET() {
  try {
    const transactions = await listTransactions();
    return Response.json({ transactions });
  } catch (err) {
    return configFailure(err) ?? Response.json({ error: "Could not read your transactions." }, { status: 500 });
  }
}

/**
 * Accepts either a single transaction object or an array of them. The array
 * form is written in one pass so a screenshot import is a single file write.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const isBatch = Array.isArray(body);
  const items = isBatch ? (body as unknown[]) : [body];

  if (items.length === 0) {
    return Response.json({ error: "No transactions provided." }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return Response.json(
      { error: `Too many transactions at once (max ${MAX_BATCH}).` },
      { status: 400 }
    );
  }

  const parsed: NewTransaction[] = [];
  for (const [index, item] of items.entries()) {
    const result = parseNewTransaction(item);
    if (!result.ok) {
      // Nothing is written unless every row is valid, so a bad row can't leave
      // a half-imported batch behind.
      // Name the row, not just its index: "item 112" is unfindable in a
      // hundred-row import.
      const label =
        typeof (item as { label?: unknown })?.label === "string"
          ? (item as { label: string }).label
          : "";
      const where = isBatch
        ? ` (row ${index + 1}${label ? `: "${label}"` : ""})`
        : "";
      return Response.json({ error: `${result.error}${where}` }, { status: 400 });
    }
    // Manual entry sends the amount in its own currency and asks for the
    // conversion. Screenshot rows never set this: their euro value is read from
    // the image and must not be recomputed against today's rate.
    if ((item as { convertFromOriginal?: unknown })?.convertFromOriginal === true) {
      try {
        result.value.amount = await toEur(result.value.originalAmount, result.value.currency);
      } catch (err) {
        if (err instanceof RateUnavailableError) {
          return Response.json({ error: err.message }, { status: 503 });
        }
        throw err;
      }
    }

    parsed.push(result.value);
  }

  try {
    const created = await addTransactions(parsed);
    return Response.json(
      isBatch ? { transactions: created } : { transaction: created[0] },
      { status: 201 }
    );
  } catch (err) {
    return configFailure(err) ?? Response.json({ error: "Could not save your transactions." }, { status: 500 });
  }
}
