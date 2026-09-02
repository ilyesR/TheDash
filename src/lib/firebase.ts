import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firestore access for server code only.
 *
 * This module reads the service-account key and must never be imported from a
 * Client Component: bundling it would hand every visitor full read/write access
 * to the database, bypassing security rules entirely.
 */

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

type ServiceAccount = {
  project_id?: string;
  projectId?: string;
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
};

/**
 * Accepts the service-account JSON either raw or base64-encoded. Base64 avoids
 * the quoting and newline mangling that a raw JSON blob suffers inside a
 * dotenv file.
 */
function readServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  if (raw) {
    const decoded = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    try {
      return JSON.parse(decoded) as ServiceAccount;
    } catch {
      throw new FirebaseConfigError(
        "FIREBASE_SERVICE_ACCOUNT is not valid JSON (raw or base64)."
      );
    }
  }

  // Fall back to the three fields split out individually.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  throw new FirebaseConfigError(
    "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64) in .env.local."
  );
}

function normalise(account: ServiceAccount) {
  const projectId = account.projectId ?? account.project_id;
  const clientEmail = account.clientEmail ?? account.client_email;
  let privateKey = account.privateKey ?? account.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseConfigError(
      "The service account is missing project_id, client_email or private_key."
    );
  }

  // dotenv keeps "\n" as two literal characters; the key needs real newlines.
  privateKey = privateKey.replace(/\\n/g, "\n");

  return { projectId, clientEmail, privateKey };
}

let cached: Firestore | null = null;

export function db(): Firestore {
  if (cached) return cached;

  const { projectId, clientEmail, privateKey } = normalise(readServiceAccount());

  // Next's dev server re-evaluates modules on every edit; reuse the app so it
  // does not throw "already exists" on the second hot reload.
  const app: App =
    getApps()[0] ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  cached = getFirestore(app);
  return cached;
}

/** Collection holding one document per transaction. */
export const TRANSACTIONS_COLLECTION =
  process.env.FIREBASE_TRANSACTIONS_COLLECTION || "transactions";

/**
 * Append-only log of every change. One document per mutation, holding the
 * before/after state, so any edit can be undone and any deletion recovered.
 */
export const HISTORY_COLLECTION =
  process.env.FIREBASE_HISTORY_COLLECTION || "transaction_history";

/**
 * Money someone owes you outside of any purchase — cash lent, a ticket bought
 * for a friend. Kept apart from transactions on purpose: a loan is a
 * receivable, not spending, and must never land in your expense totals.
 */
export const DEBTS_COLLECTION = process.env.FIREBASE_DEBTS_COLLECTION || "debts";

/** User-defined transaction categories. Seeded with sensible defaults. */
export const CATEGORIES_COLLECTION =
  process.env.FIREBASE_CATEGORIES_COLLECTION || "categories";

/** Projects that group transactions and carry their own planned spending. */
export const PROJECTS_COLLECTION =
  process.env.FIREBASE_PROJECTS_COLLECTION || "projects";

/**
 * Bucket for pictures attached to ad ideas. Images cannot live in Firestore:
 * a document is capped at 1 MB, which a couple of photos would blow through.
 */
export function storageBucketName() {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${process.env.FIREBASE_PROJECT_ID || "thedash-bbc30"}.firebasestorage.app`
  );
}

/** Goals, their rules, and the days they were ticked. */
export const GOALS_COLLECTION = process.env.FIREBASE_GOALS_COLLECTION || "goals";

/** Single document holding the dashboard's tunable settings. */
export const SETTINGS_COLLECTION =
  process.env.FIREBASE_SETTINGS_COLLECTION || "settings";
