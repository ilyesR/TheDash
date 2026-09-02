import { FirebaseConfigError } from "@/lib/firebase";
import { parseThresholds, readThresholds, writeThresholds } from "@/lib/settings-store";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ thresholds: await readThresholds() });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not read your settings." }, { status: 500 })
    );
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseThresholds(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json({ thresholds: await writeThresholds(parsed.value) });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save your settings." }, { status: 500 })
    );
  }
}
