import { randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import {
  CATEGORIES_COLLECTION,
  DEBTS_COLLECTION,
  PROJECTS_COLLECTION,
  db,
  HISTORY_COLLECTION,
  TRANSACTIONS_COLLECTION,
} from "@/lib/firebase";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_HARAM,
  DEFAULT_INCOME_CATEGORIES,
} from "@/lib/categories";

export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string;
  label: string;
  /** Euro value, always positive. Canonical figure for every total and chart. */
  amount: number;
  /** ISO 4217 code actually paid in, e.g. "USD". "EUR" when domestic. */
  currency: string;
  /** Amount in `currency`. Equal to `amount` when `currency` is EUR. */
  originalAmount: number;
  type: TransactionType;
  category: string;
  /** People who shared this bill; 1 means not split. `amount` is your share. */
  splitWays: number;
  /** The other people on the bill and whether they paid you back. */
  participants: Participant[];
  /** Project this belongs to, or null when unassigned. */
  projectId: string | null;
};

export type Participant = { name: string; settled: boolean };

export type NewTransaction = Omit<Transaction, "id">;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** Firestore caps a write batch at 500 operations. */
const BATCH_LIMIT = 500;

/**
 * Validates an untrusted request body into a transaction payload.
 * Returns an error string instead of throwing so routes can map it to a 400.
 */
export function parseNewTransaction(
  body: unknown
): { ok: true; value: NewTransaction } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.date !== "string" || !DATE_RE.test(b.date)) {
    return { ok: false, error: "`date` must be a YYYY-MM-DD string." };
  }
  if (Number.isNaN(new Date(`${b.date}T00:00:00Z`).getTime())) {
    return { ok: false, error: "`date` is not a real calendar date." };
  }

  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (!label) return { ok: false, error: "`label` is required." };
  if (label.length > 120) return { ok: false, error: "`label` is too long (max 120)." };

  const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "`amount` must be a positive number." };
  }

  if (b.type !== "income" && b.type !== "expense") {
    return { ok: false, error: "`type` must be 'income' or 'expense'." };
  }

  const category = typeof b.category === "string" ? b.category.trim() : "";
  if (!category) return { ok: false, error: "`category` is required." };
  if (category.length > 60) return { ok: false, error: "`category` is too long (max 60)." };

  // Currency is optional: a plain euro transaction can omit it.
  const currency = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "EUR";
  if (!CURRENCY_RE.test(currency)) {
    return { ok: false, error: "`currency` must be a 3-letter ISO code (e.g. EUR)." };
  }

  const rawOriginal = b.originalAmount === undefined ? amount : Number(b.originalAmount);
  if (!Number.isFinite(rawOriginal) || rawOriginal <= 0) {
    return { ok: false, error: "`originalAmount` must be a positive number." };
  }

  // Optional: rows created before bill splitting existed simply aren't shared.
  const splitWays = b.splitWays === undefined ? 1 : Number(b.splitWays);
  if (!Number.isInteger(splitWays) || splitWays < 1 || splitWays > 50) {
    return { ok: false, error: "`splitWays` must be a whole number between 1 and 50." };
  }

  // Names are optional: a split can stay anonymous.
  const participants: Participant[] = [];
  if (b.participants !== undefined) {
    if (!Array.isArray(b.participants)) {
      return { ok: false, error: "`participants` must be an array." };
    }
    if (b.participants.length > 49) {
      return { ok: false, error: "Too many participants (max 49)." };
    }
    for (const raw of b.participants) {
      const entry = raw as { name?: unknown; settled?: unknown };
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      if (!name) return { ok: false, error: "Every participant needs a name." };
      if (name.length > 60) return { ok: false, error: "A participant name is too long (max 60)." };
      participants.push({ name, settled: entry?.settled === true });
    }
  }

  if (participants.length > splitWays - 1) {
    return {
      ok: false,
      error: "There are more names than people sharing the bill.",
    };
  }

  return {
    ok: true,
    value: {
      date: b.date,
      label,
      // Store money as whole cents-precision floats; round to 2dp.
      amount: Math.round(amount * 100) / 100,
      currency,
      originalAmount: Math.round(rawOriginal * 100) / 100,
      splitWays,
      participants,
      projectId:
        typeof b.projectId === "string" && b.projectId.trim() !== ""
          ? b.projectId.trim()
          : null,
      type: b.type,
      category,
    },
  };
}

/**
 * Fills in fields added after a document was first written, so older rows keep
 * working instead of vanishing behind a stricter shape.
 */
function hydrate(id: string, data: Record<string, unknown>): Transaction | null {
  const date = typeof data.date === "string" ? data.date : "";
  const label = typeof data.label === "string" ? data.label : "";
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const type = data.type === "income" || data.type === "expense" ? data.type : null;

  if (!DATE_RE.test(date) || !label || !Number.isFinite(amount) || !type) return null;

  return {
    id,
    date,
    label,
    amount,
    currency:
      typeof data.currency === "string" && CURRENCY_RE.test(data.currency)
        ? data.currency
        : "EUR",
    originalAmount:
      typeof data.originalAmount === "number" && data.originalAmount > 0
        ? data.originalAmount
        : amount,
    splitWays:
      typeof data.splitWays === "number" && data.splitWays >= 1
        ? Math.floor(data.splitWays)
        : 1,
    projectId: typeof data.projectId === "string" && data.projectId ? data.projectId : null,
    participants: Array.isArray(data.participants)
      ? (data.participants as unknown[])
          .map((p) => p as { name?: unknown; settled?: unknown })
          .filter((p) => typeof p?.name === "string" && p.name.trim() !== "")
          .map((p) => ({ name: (p.name as string).trim(), settled: p.settled === true }))
      : [],
    type,
    category: typeof data.category === "string" ? data.category : "Other",
  };
}

function collection() {
  return db().collection(TRANSACTIONS_COLLECTION);
}

function history() {
  return db().collection(HISTORY_COLLECTION);
}

export type HistoryAction = "create" | "update" | "delete";

export type HistoryEntry = {
  id: string;
  action: HistoryAction;
  transactionId: string;
  /** State before the change; null for a creation. */
  before: Transaction | null;
  /** State after the change; null for a deletion. */
  after: Transaction | null;
  at: string | null;
};

/**
 * Records one mutation. Always written in the SAME batch as the change itself,
 * so the log can never drift out of step with the data it describes.
 */
function logChange(
  batch: FirebaseFirestore.WriteBatch,
  action: HistoryAction,
  transactionId: string,
  before: Transaction | null,
  after: Transaction | null
) {
  batch.set(history().doc(), {
    entity: "transaction",
    action,
    transactionId,
    before,
    after,
    at: FieldValue.serverTimestamp(),
  });
}

/** Newest first. */
export async function listTransactions(): Promise<Transaction[]> {
  const snapshot = await collection().orderBy("date", "desc").get();

  return snapshot.docs
    .map((doc) => hydrate(doc.id, doc.data()))
    .filter((t): t is Transaction => t !== null);
}

/**
 * Writes many transactions in one batch. A screenshot import can yield hundreds
 * of rows, and a round trip per row would be needlessly slow.
 */
export async function addTransactions(inputs: NewTransaction[]): Promise<Transaction[]> {
  const created: Transaction[] = inputs.map((input) => ({ id: randomUUID(), ...input }));
  const ref = collection();

  // Each row costs two writes (the document plus its history entry), so halve
  // the slice to stay under Firestore's 500-operation batch limit.
  const chunk = Math.floor(BATCH_LIMIT / 2);

  for (let i = 0; i < created.length; i += chunk) {
    const batch = db().batch();
    for (const t of created.slice(i, i + chunk)) {
      const { id, ...fields } = t;
      batch.set(ref.doc(id), fields);
      logChange(batch, "create", id, null, t);
    }
    await batch.commit();
  }

  return created;
}

export async function addTransaction(input: NewTransaction): Promise<Transaction> {
  const [created] = await addTransactions([input]);
  return created;
}

/**
 * Replaces the editable fields of one transaction, keeping its id. Resolves
 * `null` when no transaction carried that id.
 */
export async function updateTransaction(
  id: string,
  input: NewTransaction
): Promise<Transaction | null> {
  const doc = collection().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  const before = hydrate(id, existing.data() ?? {});
  const after: Transaction = { id, ...input };

  const batch = db().batch();
  batch.set(doc, input);
  logChange(batch, "update", id, before, after);
  await batch.commit();

  return after;
}

/** Resolves `false` when no transaction carried that id. */
export async function deleteTransaction(id: string): Promise<boolean> {
  const doc = collection().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return false;

  const before = hydrate(id, existing.data() ?? {});

  const batch = db().batch();
  batch.delete(doc);
  logChange(batch, "delete", id, before, null);
  await batch.commit();

  return true;
}

/** Most recent changes first. */
export async function listHistory(limit = 100): Promise<HistoryEntry[]> {
  const snapshot = await history().orderBy("at", "desc").limit(limit).get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    const at = d.at as { toDate?: () => Date } | undefined;
    return {
      id: doc.id,
      action: d.action as HistoryAction,
      transactionId: d.transactionId as string,
      before: (d.before ?? null) as Transaction | null,
      after: (d.after ?? null) as Transaction | null,
      // serverTimestamp is null for the instant between write and ack.
      at: at?.toDate ? at.toDate().toISOString() : null,
    };
  });
}

/**
 * Puts a transaction back the way it was before a given change: undoes an edit,
 * and resurrects a deleted row under its original id. Returns null when the
 * entry has no previous state to go back to (i.e. it was a creation).
 */
export async function revertChange(historyId: string): Promise<Transaction | null> {
  const entry = await history().doc(historyId).get();
  if (!entry.exists) return null;

  const data = entry.data() ?? {};
  const before = (data.before ?? null) as Transaction | null;
  const transactionId = data.transactionId as string;

  if (!before) {
    // The change was a creation; reverting it means removing the row again.
    await deleteTransaction(transactionId);
    return null;
  }

  // Drop the id from the payload: it lives in the document key, not the body.
  const fields = { ...before } as Partial<Transaction>;
  delete fields.id;
  const doc = collection().doc(transactionId);
  const current = await doc.get();

  const batch = db().batch();
  batch.set(doc, fields);
  logChange(
    batch,
    current.exists ? "update" : "create",
    transactionId,
    current.exists ? hydrate(transactionId, current.data() ?? {}) : null,
    { ...(fields as Omit<Transaction, "id">), id: transactionId }
  );
  await batch.commit();

  return { ...(fields as Omit<Transaction, "id">), id: transactionId };
}


// ------------------------------------------------------------------- debts

export type Debt = {
  id: string;
  date: string;
  person: string;
  /** Euro value; the figure every total is built from. */
  amount: number;
  currency: string;
  originalAmount: number;
  label: string;
  settled: boolean;
};

export type NewDebt = Omit<Debt, "id">;

function debts() {
  return db().collection(DEBTS_COLLECTION);
}

/** Mirrors logChange, for the separate debts collection. */
function logDebtChange(
  batch: FirebaseFirestore.WriteBatch,
  action: HistoryAction,
  debtId: string,
  before: Debt | null,
  after: Debt | null
) {
  batch.set(history().doc(), {
    entity: "debt",
    action,
    transactionId: debtId,
    before,
    after,
    at: FieldValue.serverTimestamp(),
  });
}

export function parseNewDebt(
  body: unknown
): { ok: true; value: NewDebt } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.date !== "string" || !DATE_RE.test(b.date)) {
    return { ok: false, error: "`date` must be a YYYY-MM-DD string." };
  }
  if (Number.isNaN(new Date(`${b.date}T00:00:00Z`).getTime())) {
    return { ok: false, error: "`date` is not a real calendar date." };
  }

  const person = typeof b.person === "string" ? b.person.trim() : "";
  if (!person) return { ok: false, error: "`person` is required." };
  if (person.length > 60) return { ok: false, error: "`person` is too long (max 60)." };

  const amount = typeof b.amount === "number" ? b.amount : Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "`amount` must be a positive number." };
  }

  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (label.length > 120) return { ok: false, error: "`label` is too long (max 120)." };

  const currency = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "EUR";
  if (!CURRENCY_RE.test(currency)) {
    return { ok: false, error: "`currency` must be a 3-letter ISO code (e.g. EUR)." };
  }

  const rawOriginal = b.originalAmount === undefined ? amount : Number(b.originalAmount);
  if (!Number.isFinite(rawOriginal) || rawOriginal <= 0) {
    return { ok: false, error: "`originalAmount` must be a positive number." };
  }

  return {
    ok: true,
    value: {
      date: b.date,
      person,
      amount: Math.round(amount * 100) / 100,
      currency,
      originalAmount: Math.round(rawOriginal * 100) / 100,
      label,
      settled: b.settled === true,
    },
  };
}

function hydrateDebt(id: string, data: Record<string, unknown>): Debt | null {
  const date = typeof data.date === "string" ? data.date : "";
  const person = typeof data.person === "string" ? data.person : "";
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);

  if (!DATE_RE.test(date) || !person || !Number.isFinite(amount)) return null;

  return {
    id,
    date,
    person,
    amount,
    currency:
      typeof data.currency === "string" && CURRENCY_RE.test(data.currency)
        ? data.currency
        : "EUR",
    originalAmount:
      typeof data.originalAmount === "number" && data.originalAmount > 0
        ? data.originalAmount
        : amount,
    label: typeof data.label === "string" ? data.label : "",
    settled: data.settled === true,
  };
}

/** Newest first. */
export async function listDebts(): Promise<Debt[]> {
  const snapshot = await debts().orderBy("date", "desc").get();
  return snapshot.docs
    .map((doc) => hydrateDebt(doc.id, doc.data()))
    .filter((d): d is Debt => d !== null);
}

export async function addDebt(input: NewDebt): Promise<Debt> {
  const created: Debt = { id: randomUUID(), ...input };
  const { id, ...fields } = created;

  const batch = db().batch();
  batch.set(debts().doc(id), fields);
  logDebtChange(batch, "create", id, null, created);
  await batch.commit();

  return created;
}

export async function updateDebt(id: string, input: NewDebt): Promise<Debt | null> {
  const doc = debts().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  const before = hydrateDebt(id, existing.data() ?? {});
  const after: Debt = { id, ...input };

  const batch = db().batch();
  batch.set(doc, input);
  logDebtChange(batch, "update", id, before, after);
  await batch.commit();

  return after;
}

export async function deleteDebt(id: string): Promise<boolean> {
  const doc = debts().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return false;

  const before = hydrateDebt(id, existing.data() ?? {});

  const batch = db().batch();
  batch.delete(doc);
  logDebtChange(batch, "delete", id, before, null);
  await batch.commit();

  return true;
}


// -------------------------------------------------------------- categories

export type CategoryKind = "expense" | "income";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  /**
   * Marked as non-permissible spending. Halal mode hides these from every
   * total and chart; the underlying transactions are never deleted.
   */
  haram: boolean;
};

function categories() {
  return db().collection(CATEGORIES_COLLECTION);
}

/**
 * Reads every category, seeding the built-in list the first time so a fresh
 * database is never left with an empty picker.
 */
export async function listCategories(): Promise<Category[]> {
  const snapshot = await categories().get();

  if (snapshot.empty) {
    const seed: Category[] = [
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
        id: randomUUID(),
        name,
        kind: "expense" as const,
        haram: DEFAULT_HARAM.includes(name),
      })),
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({
        id: randomUUID(),
        name,
        kind: "income" as const,
        haram: DEFAULT_HARAM.includes(name),
      })),
    ];

    const batch = db().batch();
    for (const { id, ...fields } of seed) batch.set(categories().doc(id), fields);
    await batch.commit();

    return seed;
  }

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      const name = typeof d.name === "string" ? d.name.trim() : "";
      const kind = d.kind === "income" ? "income" : "expense";
      return name
        ? { id: doc.id, name, kind: kind as CategoryKind, haram: d.haram === true }
        : null;
    })
    .filter((c): c is Category => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseNewCategory(
  body: unknown
): { ok: true; value: Omit<Category, "id"> } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "A category name is required." };
  if (name.length > 60) return { ok: false, error: "That name is too long (max 60)." };

  if (b.kind !== "expense" && b.kind !== "income") {
    return { ok: false, error: "`kind` must be 'expense' or 'income'." };
  }

  return { ok: true, value: { name, kind: b.kind, haram: b.haram === true } };
}

/** Resolves null when a category of the same name and kind already exists. */
export async function addCategory(
  input: Omit<Category, "id">
): Promise<Category | null> {
  const existing = await listCategories();
  const clash = existing.some(
    (c) => c.kind === input.kind && c.name.toLowerCase() === input.name.toLowerCase()
  );
  if (clash) return null;

  const created: Category = { id: randomUUID(), ...input };
  const { id, ...fields } = created;
  await categories().doc(id).set(fields);
  return created;
}

/**
 * Removes a category. Transactions already filed under it keep their label —
 * the string lives on the transaction, so nothing is orphaned or rewritten.
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const doc = categories().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return false;

  await doc.delete();
  return true;
}


// ---------------------------------------------------------------- projects

export type PlannedItem = {
  id: string;
  label: string;
  amount: number;
  currency: string;
  originalAmount: number;
  dueDate: string;
};

export type IdeaStatus = "idea" | "doing" | "done";

export type Idea = {
  id: string;
  text: string;
  status: IdeaStatus;
};

export type AdIdea = {
  id: string;
  text: string;
  imageUrl: string;
  imagePath: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  planned: PlannedItem[];
  notes: string;
  ideas: Idea[];
  adNotes: string;
  adIdeas: AdIdea[];
};

export type NewProject = Omit<Project, "id">;

function projects() {
  return db().collection(PROJECTS_COLLECTION);
}

function hydratePlanned(raw: unknown): PlannedItem | null {
  const p = raw as Record<string, unknown>;
  const amount = typeof p?.amount === "number" ? p.amount : Number(p?.amount);
  const label = typeof p?.label === "string" ? p.label.trim() : "";
  if (!label || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    id: typeof p.id === "string" && p.id ? p.id : randomUUID(),
    label,
    amount: Math.round(amount * 100) / 100,
    currency:
      typeof p.currency === "string" && CURRENCY_RE.test(p.currency) ? p.currency : "EUR",
    originalAmount:
      typeof p.originalAmount === "number" && p.originalAmount > 0
        ? p.originalAmount
        : amount,
    dueDate: typeof p.dueDate === "string" && DATE_RE.test(p.dueDate) ? p.dueDate : "",
  };
}

function hydrateIdea(raw: unknown): Idea | null {
  const i = raw as Record<string, unknown>;
  const text = typeof i?.text === "string" ? i.text.trim() : "";
  if (!text) return null;

  const status =
    i.status === "doing" || i.status === "done" ? (i.status as IdeaStatus) : "idea";

  return {
    id: typeof i.id === "string" && i.id ? i.id : randomUUID(),
    text: text.slice(0, 400),
    status,
  };
}

function hydrateAdIdea(raw: unknown): AdIdea | null {
  const a = raw as Record<string, unknown>;
  const text = typeof a?.text === "string" ? a.text.trim() : "";
  const imageUrl = typeof a?.imageUrl === "string" ? a.imageUrl : "";

  // An ad can be a picture with no caption, so keep it if either side is set.
  if (!text && !imageUrl) return null;

  return {
    id: typeof a.id === "string" && a.id ? a.id : randomUUID(),
    text: text.slice(0, 600),
    imageUrl,
    imagePath: typeof a.imagePath === "string" ? a.imagePath : "",
  };
}

export function parseNewProject(
  body: unknown
): { ok: true; value: NewProject } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "A project name is required." };
  if (name.length > 80) return { ok: false, error: "That name is too long (max 80)." };

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 400) {
    return { ok: false, error: "The description is too long (max 400)." };
  }

  const planned: PlannedItem[] = [];
  if (b.planned !== undefined) {
    if (!Array.isArray(b.planned)) {
      return { ok: false, error: "`planned` must be an array." };
    }
    if (b.planned.length > 200) {
      return { ok: false, error: "Too many planned items (max 200)." };
    }
    for (const raw of b.planned) {
      const item = hydratePlanned(raw);
      if (!item) return { ok: false, error: "Every planned item needs a label and an amount." };
      planned.push(item);
    }
  }

  const notes = typeof b.notes === "string" ? b.notes : "";
  if (notes.length > 20000) {
    return { ok: false, error: "These notes are too long (max 20000 characters)." };
  }

  const ideas: Idea[] = [];
  if (b.ideas !== undefined) {
    if (!Array.isArray(b.ideas)) {
      return { ok: false, error: "`ideas` must be an array." };
    }
    if (b.ideas.length > 500) {
      return { ok: false, error: "Too many ideas (max 500)." };
    }
    for (const raw of b.ideas) {
      const idea = hydrateIdea(raw);
      if (idea) ideas.push(idea);
    }
  }

  const adNotes = typeof b.adNotes === "string" ? b.adNotes : "";
  if (adNotes.length > 20000) {
    return { ok: false, error: "These ad notes are too long (max 20000 characters)." };
  }

  const adIdeas: AdIdea[] = [];
  if (b.adIdeas !== undefined) {
    if (!Array.isArray(b.adIdeas)) {
      return { ok: false, error: "`adIdeas` must be an array." };
    }
    if (b.adIdeas.length > 200) {
      return { ok: false, error: "Too many ad ideas (max 200)." };
    }
    for (const raw of b.adIdeas) {
      const ad = hydrateAdIdea(raw);
      if (ad) adIdeas.push(ad);
    }
  }

  return {
    ok: true,
    value: { name, description, planned, notes, ideas, adNotes, adIdeas },
  };
}

export async function listProjects(): Promise<Project[]> {
  const snapshot = await projects().get();

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      const name = typeof d.name === "string" ? d.name.trim() : "";
      if (!name) return null;
      return {
        id: doc.id,
        name,
        description: typeof d.description === "string" ? d.description : "",
        planned: Array.isArray(d.planned)
          ? d.planned.map(hydratePlanned).filter((p): p is PlannedItem => p !== null)
          : [],
        notes: typeof d.notes === "string" ? d.notes : "",
        ideas: Array.isArray(d.ideas)
          ? d.ideas.map(hydrateIdea).filter((i): i is Idea => i !== null)
          : [],
        adNotes: typeof d.adNotes === "string" ? d.adNotes : "",
        adIdeas: Array.isArray(d.adIdeas)
          ? d.adIdeas.map(hydrateAdIdea).filter((a): a is AdIdea => a !== null)
          : [],
      };
    })
    .filter((p): p is Project => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addProject(input: NewProject): Promise<Project> {
  const created: Project = { id: randomUUID(), ...input };
  const { id, ...fields } = created;
  await projects().doc(id).set(fields);
  return created;
}

export async function updateProject(
  id: string,
  input: NewProject
): Promise<Project | null> {
  const doc = projects().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  await doc.set(input);
  return { id, ...input };
}

/**
 * Deletes a project and detaches its transactions, which are kept: they are
 * real spending that happened, whatever bucket they were filed under.
 */
export async function deleteProject(id: string): Promise<boolean> {
  const doc = projects().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return false;

  const attached = await collection().where("projectId", "==", id).get();

  for (let i = 0; i < attached.docs.length; i += BATCH_LIMIT - 1) {
    const batch = db().batch();
    for (const t of attached.docs.slice(i, i + BATCH_LIMIT - 1)) {
      batch.update(t.ref, { projectId: null });
    }
    await batch.commit();
  }

  await doc.delete();
  return true;
}


/** Flips whether a category counts as non-permissible spending. */
export async function setCategoryHaram(
  id: string,
  haram: boolean
): Promise<Category | null> {
  const doc = categories().doc(id);
  const existing = await doc.get();
  if (!existing.exists) return null;

  await doc.update({ haram });

  const d = existing.data() ?? {};
  return {
    id,
    name: typeof d.name === "string" ? d.name.trim() : "",
    kind: d.kind === "income" ? "income" : "expense",
    haram,
  };
}
