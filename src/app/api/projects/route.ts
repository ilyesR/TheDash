import { addProject, listProjects, parseNewProject } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ projects: await listProjects() });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not read your projects." }, { status: 500 })
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

  const parsed = parseNewProject(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    return Response.json({ project: await addProject(parsed.value) }, { status: 201 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that project." }, { status: 500 })
    );
  }
}
