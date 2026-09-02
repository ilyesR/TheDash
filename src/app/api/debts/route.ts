import { addDebt, listDebts, parseNewDebt } from "@/lib/finance";
import { FirebaseConfigError } from "@/lib/firebase";
import { RateUnavailableError, toEur } from "@/lib/fx";

function configFailure(err: unknown) {
  if (err instanceof FirebaseConfigError) {
    return Response.json({ error: err.message }, { status: 503 });
  }
  return null;
}

export async function GET() {
  try {
    return Response.json({ debts: await listDebts() });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not read your paybacks." }, { status: 500 })
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

  const parsed = parseNewDebt(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if ((body as { convertFromOriginal?: unknown })?.convertFromOriginal === true) {
    try {
      // originalAmount holds what was typed; amount is always its euro value.
      parsed.value.amount = await toEur(parsed.value.originalAmount, parsed.value.currency);
    } catch (err) {
      if (err instanceof RateUnavailableError) {
        return Response.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
  }

  try {
    return Response.json({ debt: await addDebt(parsed.value) }, { status: 201 });
  } catch (err) {
    return (
      configFailure(err) ??
      Response.json({ error: "Could not save that payback." }, { status: 500 })
    );
  }
}
