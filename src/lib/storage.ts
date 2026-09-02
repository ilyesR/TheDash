import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

import { db, storageBucketName } from "@/lib/firebase";

/** Signed links are capped by Google at 7 days; refresh on read if needed. */
const URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Firebase Storage is not enabled on this project. Turn it on in the Firebase console, then try again."
    );
    this.name = "StorageUnavailableError";
  }
}

function bucket() {
  // Touch db() first so the Admin app is initialised with the credentials.
  db();
  return getStorage().bucket(storageBucketName());
}

export async function uploadImage(
  data: string,
  mediaType: string
): Promise<{ url: string; path: string }> {
  const target = bucket();

  const [exists] = await target.exists().catch(() => [false] as [boolean]);
  if (!exists) throw new StorageUnavailableError();

  const extension = mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const path = `ad-ideas/${randomUUID()}.${extension}`;
  const file = target.file(path);

  await file.save(Buffer.from(data, "base64"), {
    contentType: mediaType,
    resumable: false,
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + URL_TTL_MS,
  });

  return { url, path };
}

/** Best-effort cleanup: a missing file should not fail the surrounding edit. */
export async function deleteImage(path: string): Promise<void> {
  if (!path) return;
  try {
    await bucket().file(path).delete();
  } catch {
    // Already gone, or storage disabled; nothing to recover.
  }
}
