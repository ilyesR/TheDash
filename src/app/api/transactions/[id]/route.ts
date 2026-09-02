import type { NextRequest } from "next/server";

import { deleteTransaction, parseNewTransaction, updateTransaction } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/transactions/[id]">
) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseNewTransaction(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = await updateTransaction(id, parsed.value);
    if (!updated) {
      return Response.json({ error: "Transaction not found." }, { status: 404 });
    }
    return Response.json({ transaction: updated });
  } catch (err) {
    return configFailure(err) ?? Response.json({ error: "Could not save that change." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/transactions/[id]">
) {
  const { id } = await ctx.params;

  try {
    const removed = await deleteTransaction(id);
    if (!removed) {
      return Response.json({ error: "Transaction not found." }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return configFailure(err) ?? Response.json({ error: "Could not delete that transaction." }, { status: 500 });
  }
}
