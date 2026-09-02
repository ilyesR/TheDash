import { addCategory, listCategories, parseNewCategory } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ categories: await listCategories() });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not read your categories." }, { status: 500 })
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseNewCategory(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const created = await addCategory(parsed.value);
    if (!created) {
      return Response.json({ error: "That category already exists." }, { status: 409 });
    }
    return Response.json({ category: created }, { status: 201 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that category." }, { status: 500 })
    );
  }
}
