import type { NextRequest } from "next/server";

import { FirebaseConfigError } from "@/lib/firebase";
import { deleteGoal, parseNewGoal, updateGoal } from "@/lib/goals-store";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/goals/[id]">) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseNewGoal(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const updated = await updateGoal(id, parsed.value);
    if (!updated) return Response.json({ error: "Goal not found." }, { status: 404 });
    return Response.json({ goal: updated });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that change." }, { status: 500 })
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/goals/[id]">
) {
  const { id } = await ctx.params;

  try {
    const removed = await deleteGoal(id);
    if (!removed) return Response.json({ error: "Goal not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not delete that goal." }, { status: 500 })
    );
  }
}
