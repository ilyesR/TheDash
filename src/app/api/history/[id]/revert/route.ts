import type { NextRequest } from "next/server";

import { revertChange } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/history/[id]/revert">
) {
  const { id } = await ctx.params;

  try {
    const restored = await revertChange(id);
    // A reverted creation leaves nothing behind, which is a success too.
    return Response.json({ transaction: restored });
  } catch (err) {
    if (err instanceof FirebaseConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "Could not revert that change." }, { status: 500 });
  }
}
