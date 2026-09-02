import { FirebaseConfigError } from "@/lib/firebase";
import { addGoal, listGoals, parseNewGoal } from "@/lib/goals-store";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ goals: await listGoals() });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not read your goals." }, { status: 500 })
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

  const parsed = parseNewGoal(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json({ goal: await addGoal(parsed.value) }, { status: 201 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that goal." }, { status: 500 })
    );
  }
}
