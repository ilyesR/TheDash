/**
 * Server-side client for the KA AI Gateway.
 *
 * This module must never be imported from a Client Component: it reads
 * KA_API_KEY, and anything bundled for the browser would leak that key to
 * every visitor.
 */

const DEFAULT_BASE_URL = "https://api.ka-agency.com";
const DEFAULT_VISION_MODEL = "openai/gpt-5.5";

/**
 * Reasoning models burn tokens on thinking before emitting any content, so a
 * tight cap returns `content: null` with finish_reason MAX_TOKENS. A statement
 * screenshot can also yield dozens of rows, which is a lot of output JSON.
 */
const MAX_TOKENS = 16000;

/** Transient upstream statuses worth retrying, per the gateway's error contract. */
const RETRYABLE = new Set([408, 409, 429, 502]);
const MAX_ATTEMPTS = 3;

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export type ImagePart = {
  /** Base64 payload without the `data:` prefix. */
  data: string;
  mediaType: string;
};

type ChatResponse = {
  content: string | null;
  finish_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
  cost_usd?: number;
};

/**
 * OpenAI's strict structured-output mode rejects any object node that does not
 * carry `additionalProperties: false`. Walking the schema here keeps callers
 * free to write plain JSON Schema, and is harmless for the other providers.
 */
function sealObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sealObjects);
  if (typeof node !== "object" || node === null) return node;

  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) copy[key] = sealObjects(value);
  if (copy.type === "object") copy.additionalProperties = false;
  return copy;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls /v1/chat with one image and a JSON schema, returning the parsed object.
 * Retries transient failures with backoff; 4xx (other than 408/409/429) fail fast.
 */
export async function extractWithVision<T>({
  prompt,
  image,
  schema,
}: {
  prompt: string;
  image: ImagePart;
  schema: Record<string, unknown>;
}): Promise<T> {
  const apiKey = process.env.KA_API_KEY;
  if (!apiKey) {
    throw new GatewayError("KA_API_KEY is not configured on the server.", 500, false);
  }

  const baseUrl = process.env.KA_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.KA_VISION_MODEL || DEFAULT_VISION_MODEL;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  // Required when the key is tied to a client but not to an app, otherwise
  // the gateway cannot attribute the usage.
  const appId = process.env.KA_APP_ID;
  if (appId) headers["X-KA-App"] = appId;

  const body = JSON.stringify({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          // The gateway rejects the `url` form for gemini/, so always send base64.
          { type: "image", data: image.data, media_type: image.mediaType },
        ],
      },
    ],
    // Portable structured-output shape: openai/ rejects a bare { schema }
    // ("Missing required parameter: text.format.type/name"), while gemini/ and
    // anthropic/ accept the typed+named form too.
    response_format: { type: "json_schema", name: "extraction", schema: sealObjects(schema) },
  });

  let lastError: GatewayError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/chat`, { method: "POST", headers, body });
    } catch {
      lastError = new GatewayError("Could not reach the AI gateway.", 502, true);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(400 * attempt);
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      const payload = (await res.json()) as ChatResponse;

      if (!payload.content) {
        // Almost always a truncated reasoning model; not worth a blind retry.
        throw new GatewayError(
          `The model returned no content (finish_reason: ${payload.finish_reason ?? "unknown"}).`,
          502,
          false
        );
      }

      try {
        return JSON.parse(payload.content) as T;
      } catch {
        throw new GatewayError("The model returned malformed JSON.", 502, false);
      }
    }

    const detail = await res
      .json()
      .then((j) => j?.detail?.message as string | undefined)
      .catch(() => undefined);

    const retryable = RETRYABLE.has(res.status);
    lastError = new GatewayError(detail ?? `Gateway error ${res.status}.`, res.status, retryable);

    if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;

    // Rate limits deserve a longer pause than a timeout or a conflict.
    await sleep((res.status === 429 ? 1500 : 500) * attempt);
  }

  throw lastError ?? new GatewayError("The AI gateway failed.", 502, false);
}
