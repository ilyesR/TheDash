import { extractWithVision, GatewayError } from "@/lib/ka-gateway";
import { listCategories } from "@/lib/finance";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/categories";

/** Rejects oversized uploads before they reach the model. Base64 inflates ~4/3. */
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const FALLBACK_CATEGORIES = [
  ...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]),
];

/** Your saved categories, so the model can only return one you can select. */
async function allCategories(): Promise<string[]> {
  try {
    const saved = await listCategories();
    const names = [...new Set(saved.map((c) => c.name))];
    return names.length > 0 ? names : FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

function buildSchema(categories: string[]) {
  return {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      description: "Every transaction visible in the image, in the order shown. Empty if none.",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "Transaction date as YYYY-MM-DD." },
          label: { type: "string", description: "Short merchant name or description." },
          amount: {
            type: "number",
            description:
              "The EUR value of this row, always positive. If the row was paid in a foreign currency, this is the euro equivalent shown in the image.",
          },
          currency: {
            type: "string",
            description:
              "ISO 4217 code the payment was actually made in, e.g. USD, GBP, CHF. Use EUR for a plain euro transaction.",
          },
          originalAmount: {
            type: "number",
            description:
              "The amount in that currency, always positive. Equal to amount when the currency is EUR.",
          },
          type: {
            type: "string",
            enum: ["income", "expense"],
            description: "'expense' if money left the account, 'income' if it came in.",
          },
          category: { type: "string", enum: categories },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["date", "label", "amount", "currency", "originalAmount", "type", "category", "confidence"],
      },
    },
    note: {
      type: "string",
      description: "If transactions is empty, one short sentence explaining why.",
    },
  },
    required: ["transactions", "note"],
  };
}

type Extracted = {
  date: string;
  label: string;
  amount: number;
  currency: string;
  originalAmount: number;
  type: "income" | "expense";
  category: string;
  confidence: "low" | "medium" | "high";
};

type Extraction = { transactions: Extracted[]; note: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The model occasionally returns a partial or reformatted date ("2026-08",
 * "12/08/2026", ""). Rather than let one bad row reject a 100-row import at
 * the storage layer, blank it here so the review list can ask for it.
 */
function safeDate(value: unknown): string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return "";
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? "" : value;
}

function buildPrompt(today: string, categories: string[]) {
  return [
    "You read a screenshot or photo of financial activity: a banking app list,",
    "a statement, an invoice, or a receipt.",
    "",
    "Extract EVERY transaction visible in the image, not just the first one.",
    "A banking screenshot usually shows many rows — return one entry per row.",
    "A single receipt is usually ONE transaction: its final total, not each line item.",
    "",
    "Rules:",
    `- Today is ${today}. Use it to resolve relative dates ("Yesterday") and missing years.`,
    "- 'date' must be YYYY-MM-DD. Beware day-first formats: 03/04/2026 written in",
    "  a European context means 3 April 2026, not 4 March 2026.",
    "- Rows under a heading like 'Today' or a date separator inherit that date.",
    "- 'amount' is that row's own amount, always positive. Never return a running",
    "  balance, an account total, or a summary line as a transaction.",
    "- 'type' is 'expense' when money left the account, 'income' when it came in.",
    "  A leading minus sign or a red amount means 'expense'.",
    "- 'label' is short (a merchant name or a few words), never a full sentence.",
    "",
    "Currency:",
    "- Many rows are foreign-currency payments shown with their euro equivalent,",
    "  e.g. '-45.00 USD' with '41.20 EUR' underneath, or 'US$45.00 (41,20 €)'.",
    "- 'currency' is the ISO code actually charged (USD, GBP, CHF...), and",
    "  'originalAmount' is the figure in that currency.",
    "- 'amount' is ALWAYS the euro figure. Copy the euro equivalent shown in the",
    "  image — never convert a rate yourself.",
    "- For a plain euro row set currency to EUR and originalAmount equal to amount.",
    "- If a foreign amount has NO euro equivalent visible, still report the currency",
    "  and originalAmount, set 'amount' to 0, and lower 'confidence' to low.",
    `- 'category' must be one of: ${categories.join(", ")}. Use "Other" when unsure.`,
    "- Skip pending/declined rows only if they are clearly marked as not settled.",
    "- Return an empty 'transactions' array if the image shows no transaction,",
    "  and say why in 'note'.",
    "- Never invent a value you cannot see: lower that row's 'confidence' instead.",
  ].join("\n");
}

export async function POST(request: Request) {
  // Fails before touching the image so a missing key reads as a setup issue,
  // not as an unreadable screenshot.
  if (!process.env.KA_API_KEY?.trim()) {
    return Response.json(
      { error: "No AI key configured. Set KA_API_KEY in .env.local to read screenshots." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const data = typeof b.data === "string" ? b.data : "";
  const mediaType = typeof b.mediaType === "string" ? b.mediaType : "";

  if (!data) {
    return Response.json({ error: "Missing image `data`." }, { status: 400 });
  }
  if (data.length > MAX_BASE64_LENGTH) {
    return Response.json({ error: "That image is too large (max ~6 MB)." }, { status: 400 });
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return Response.json(
      { error: "Unsupported image type. Use PNG, JPEG, WebP or GIF." },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const categories = await allCategories();

    const result = await extractWithVision<Extraction>({
      prompt: buildPrompt(today, categories),
      image: { data, mediaType },
      schema: buildSchema(categories),
    });

    const transactions = (result.transactions ?? [])
      .filter((t) => t && t.label && Number(t.originalAmount) > 0)
      .map((t) => ({
        ...t,
        // A missing euro equivalent leaves amount at 0; the review list then
        // asks the user for it rather than guessing an exchange rate.
        currency: (t.currency || "EUR").toUpperCase(),
        amount: Number(t.amount) > 0 ? t.amount : 0,
        date: safeDate(t.date),
      }));

    if (transactions.length === 0) {
      return Response.json(
        { error: result.note || "No transaction could be read from that image." },
        { status: 422 }
      );
    }

    return Response.json({ transactions });
  } catch (err) {
    if (err instanceof GatewayError) {
      const status = err.status === 500 ? 500 : err.retryable ? 503 : 502;
      return Response.json({ error: err.message }, { status });
    }
    return Response.json({ error: "Screenshot analysis failed." }, { status: 500 });
  }
}
