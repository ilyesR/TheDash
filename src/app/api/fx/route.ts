import { getRate, RateUnavailableError } from "@/lib/fx";

export async function GET(request: Request) {
  const currency = new URL(request.url).searchParams.get("currency") ?? "EUR";

  try {
    return Response.json({ rate: await getRate(currency) });
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "Could not fetch the exchange rate." }, { status: 500 });
  }
}
