/**
 * One-off import of data/transactions.json into Firestore.
 *
 *   node scripts/migrate-to-firestore.mjs [--dry-run]
 *
 * Safe to re-run: each row keeps its existing id, so a second run overwrites
 * the same documents instead of duplicating them.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");
const FILE = path.join(process.cwd(), "data", "transactions.json");
const COLLECTION = process.env.FIREBASE_TRANSACTIONS_COLLECTION || "transactions";

// Load .env.local the way Next does, without pulling in a dependency.
async function loadEnv() {
  let raw;
  try {
    raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return {
      projectId: parsed.project_id ?? parsed.projectId,
      clientEmail: parsed.client_email ?? parsed.clientEmail,
      privateKey: (parsed.private_key ?? parsed.privateKey).replace(/\n/g, "\n"),
    };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n"),
  };
}

await loadEnv();

let rows;
try {
  rows = JSON.parse(await readFile(FILE, "utf8"));
} catch {
  console.error(`No readable ${FILE}. Nothing to migrate.`);
  process.exit(1);
}

if (!Array.isArray(rows) || rows.length === 0) {
  console.log("The local file holds no transactions. Nothing to migrate.");
  process.exit(0);
}

console.log(`Found ${rows.length} transaction(s) in ${FILE}.`);

if (DRY_RUN) {
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.date}  ${r.label}  ${r.amount} ${r.currency ?? "EUR"}`);
  }
  if (rows.length > 5) console.log(`  … and ${rows.length - 5} more`);
  console.log("\nDry run: nothing was written.");
  process.exit(0);
}

const account = serviceAccount();
if (!account.projectId || !account.clientEmail || !account.privateKey) {
  console.error("Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT in .env.local.");
  process.exit(1);
}

const app = initializeApp({ credential: cert(account) });
const db = getFirestore(app);
const ref = db.collection(COLLECTION);

let written = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = db.batch();
  for (const row of rows.slice(i, i + 500)) {
    const { id, ...fields } = row;
    batch.set(ref.doc(id || randomUUID()), {
      ...fields,
      currency: fields.currency ?? "EUR",
      originalAmount: fields.originalAmount ?? fields.amount,
      splitWays: fields.splitWays ?? 1,
    });
    written += 1;
  }
  await batch.commit();
}

console.log(`Imported ${written} transaction(s) into "${COLLECTION}".`);
process.exit(0);
