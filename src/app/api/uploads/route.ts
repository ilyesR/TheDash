import { FirebaseConfigError } from "@/lib/firebase";
import { StorageUnavailableError, deleteImage, uploadImage } from "@/lib/storage";

/** Base64 inflates by ~4/3; this caps the decoded image near 4 MB. */
const MAX_BASE64_LENGTH = 6 * 1024 * 1024;

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const data = typeof b.data === "string" ? b.data : "";
  const mediaType = typeof b.mediaType === "string" ? b.mediaType : "";

  if (!data) return Response.json({ error: "Missing image `data`." }, { status: 400 });
  if (data.length > MAX_BASE64_LENGTH) {
    return Response.json({ error: "That picture is too large (max ~4 MB)." }, { status: 400 });
  }
  if (!ALLOWED.has(mediaType)) {
    return Response.json(
      { error: "Unsupported image type. Use PNG, JPEG, WebP or GIF." },
      { status: 400 }
    );
  }

  try {
    return Response.json(await uploadImage(data, mediaType), { status: 201 });
  } catch (err) {
    if (err instanceof StorageUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof FirebaseConfigError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: "Could not upload that picture." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  await deleteImage(path);
  return new Response(null, { status: 204 });
}
