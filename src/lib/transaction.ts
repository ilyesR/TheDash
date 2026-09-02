/**
 * Client-safe transaction types. Kept out of `finance.ts` because that module
 * pulls in `node:fs` and must never reach the browser bundle.
 */

export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string;
  label: string;
  /**
   * Euro value, always positive. This is the canonical figure: every total,
   * chart and category breakdown is computed from it.
   */
  amount: number;
  /** ISO 4217 code of what was actually paid, e.g. "USD". "EUR" when domestic. */
  currency: string;
  /** Amount in `currency`. Equal to `amount` when `currency` is EUR. */
  originalAmount: number;
  type: TransactionType;
  category: string;
  /**
   * How many people shared this bill. 1 means it was not split. `amount` and
   * `originalAmount` already hold YOUR share, so the full bill is
   * `amount * splitWays`.
   */
  splitWays: number;
  /** Project this belongs to, or null when unassigned. */
  projectId: string | null;
  /**
   * The OTHER people on this bill — you are not listed. Each owes `amount`,
   * since shares are equal. May be shorter than `splitWays - 1` when some
   * are left unnamed.
   */
  participants: Participant[];
};

export type Confidence = "low" | "medium" | "high";

/** Someone who shared a bill you paid, and whether they have settled up. */
export type Participant = {
  name: string;
  /** True once they have paid you back their share. */
  settled: boolean;
};

/** True when the payment was made in something other than euros. */
export function isForeign(t: { currency: string }) {
  return t.currency !== "EUR";
}

export function formatOriginal(t: { originalAmount: number; currency: string }) {
  return `${t.originalAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${t.currency}`;
}

/** True when this bill was shared with other people. */
export function isSplit(t: { splitWays: number }) {
  return t.splitWays > 1;
}

/** The full bill before it was divided. */
export function fullAmount(t: { amount: number; splitWays: number }) {
  return Math.round(t.amount * t.splitWays * 100) / 100;
}

/** Everyone on this bill who still owes you their share. */
export function unsettled(t: { participants: Participant[] }) {
  return t.participants.filter((p) => !p.settled);
}

/** What this bill still owes you across all its unpaid participants. */
export function owedOn(t: { amount: number; participants: Participant[] }) {
  return Math.round(unsettled(t).length * t.amount * 100) / 100;
}

/** A standalone amount someone owes you, unrelated to a split purchase. */
export type Debt = {
  id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string;
  person: string;
  /** Euro amount owed to you, always positive. Canonical for every total. */
  amount: number;
  /** ISO 4217 code it was entered in. "EUR" when no conversion happened. */
  currency: string;
  /** Amount in `currency`; equal to `amount` when that is EUR. */
  originalAmount: number;
  /** Optional reason, e.g. "concert ticket". */
  label: string;
  settled: boolean;
};

/** An expense you expect to make for a project but have not made yet. */
export type PlannedItem = {
  id: string;
  label: string;
  /** Euro value, always positive. */
  amount: number;
  /** ISO 4217 code it was entered in. */
  currency: string;
  originalAmount: number;
  /** Optional target date, `YYYY-MM-DD`. */
  dueDate: string;
};

/** Where an idea stands. Deliberately coarse: three states, no ceremony. */
export type IdeaStatus = "idea" | "doing" | "done";

export type Idea = {
  id: string;
  text: string;
  status: IdeaStatus;
};

/** An advertising concept, optionally with a visual attached. */
export type AdIdea = {
  id: string;
  text: string;
  /** Empty when no picture is attached. */
  imageUrl: string;
  /** Storage path, kept so the file can be removed with the idea. */
  imagePath: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  planned: PlannedItem[];
  /** Free-form brainstorming: context, links, anything worth remembering. */
  notes: string;
  ideas: Idea[];
  /** Notes specific to advertising this project. */
  adNotes: string;
  adIdeas: AdIdea[];
};

/** What a project has cost, is about to cost, and has brought back. */
export type ProjectTotals = {
  spent: number;
  planned: number;
  earned: number;
  /** earned − spent. Planned spending is deliberately excluded: it is not real yet. */
  net: number;
  transactions: number;
};

export function projectTotals(
  project: Project,
  transactions: Transaction[]
): ProjectTotals {
  let spent = 0;
  let earned = 0;
  let count = 0;

  for (const t of transactions) {
    if (t.projectId !== project.id) continue;
    count += 1;
    if (t.type === "expense") spent += t.amount;
    else earned += t.amount;
  }

  const planned = project.planned.reduce((sum, p) => sum + p.amount, 0);

  return {
    spent: Math.round(spent * 100) / 100,
    planned: Math.round(planned * 100) / 100,
    earned: Math.round(earned * 100) / 100,
    net: Math.round((earned - spent) * 100) / 100,
    transactions: count,
  };
}
