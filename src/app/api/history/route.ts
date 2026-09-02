import { listHistory } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : 100;

  try {
    return Response.json({ history: await listHistory(limit) });
  } catch (err) {
    if (err instanceof FirebaseConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "Could not read the change history." }, { status: 500 });
  }
}
