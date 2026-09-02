import type { NextRequest } from "next/server";

import { deleteCategory, setCategoryHaram } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

/** Only the halal flag is editable; renaming would orphan filed transactions. */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/categories/[id]">
) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const haram = (body as { haram?: unknown })?.haram;
  if (typeof haram !== "boolean") {
    return Response.json({ error: "`haram` must be true or false." }, { status: 400 });
  }

  try {
    const updated = await setCategoryHaram(id, haram);
    if (!updated) return Response.json({ error: "Category not found." }, { status: 404 });
    return Response.json({ category: updated });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that change." }, { status: 500 })
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/categories/[id]">
) {
  const { id } = await ctx.params;

  try {
    const removed = await deleteCategory(id);
    if (!removed) return Response.json({ error: "Category not found." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not delete that category." }, { status: 500 })
    );
  }
}
