import type { NextRequest } from "next/server";

import { FirebaseConfigError } from "@/lib/firebase";
import { setCheckIn } from "@/lib/goals-store";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/goals/[id]/check">
) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as { date?: unknown; done?: unknown };
  if (typeof b.date !== "string" || typeof b.done !== "boolean") {
    return Response.json(
      { error: "`date` (YYYY-MM-DD) and `done` (boolean) are required." },
      { status: 400 }
    );
  }

  try {
    const goal = await setCheckIn(id, b.date, b.done);
    if (!goal) return Response.json({ error: "Goal not found." }, { status: 404 });
    return Response.json({ goal });
  } catch (err) {
    if (err instanceof FirebaseConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "Could not save that check-in." }, { status: 500 });
  }
}
