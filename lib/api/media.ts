import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getObject, putObject } from "../storage";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";
import { ApiError, invalid } from "./http";

const { media } = schema;

const MAX_IMAGE_BYTES = 1024 * 1024; // contract: JPEG, max 1 MB
// event_id goes into the object key, so it may only be a plain name (no "/" or "..").
const SAFE_EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const JPEG = "image/jpeg";

/** Read the camera's multipart upload: event_id and a real JPEG (checked by its first bytes) of at most 1 MB. */
export async function readImageUpload(req: Request) {
  // Refuse an oversized body before reading it (a little room for the form's own boundaries and fields).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 16 * 1024) {
    throw invalid("file", "Must be at most 1 MB");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw invalid("body", "Must be multipart/form-data with event_id and file");
  }
  const eventId = form.get("event_id");
  if (typeof eventId !== "string" || !SAFE_EVENT_ID.test(eventId)) {
    throw invalid("event_id", "Must be the feeding's event_id (letters, digits, - and _)");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw invalid("file", "Missing: attach the JPEG as file");
  if (file.size > MAX_IMAGE_BYTES) throw invalid("file", "Must be at most 1 MB");
  const data = Buffer.from(await file.arrayBuffer());
  if (!(data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)) throw invalid("file", "Must be a JPEG");
  return { eventId, data };
}

/**
 * Store the ESP32-CAM's photo for one feeding (spec Section 9, rule 5). The object key comes from the feeder
 * and event_id only, never a secret. The event may not exist yet: the photo is joined to it at read time.
 */
export async function saveImage(feederId: string, eventId: string, data: Buffer) {
  const objectKey = `images/${feederId}/${eventId}.jpg`;
  await putObject(objectKey, data, JPEG);
  const [row] = await db
    .insert(media)
    .values({ feederId, kind: "image", objectKey, eventId, contentType: JPEG })
    .onConflictDoUpdate({ target: [media.feederId, media.eventId], set: { objectKey } })
    .returning();
  return { media_id: row.id, event_id: eventId };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A stored file for a user who may see its feeder (owner or admin), as a stream; MinIO itself is never exposed.
 * Any id that names no file, malformed or not, is a 404.
 */
export async function openMedia(user: AuthUser, mediaId: string) {
  const notFound = new ApiError(404, "not_found", `Media ${mediaId} not found`);
  if (!UUID_PATTERN.test(mediaId)) throw notFound;
  const [row] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!row) throw notFound;
  await requireFeeder(user, row.feederId);
  const body = Readable.toWeb(await getObject(row.objectKey)) as ReadableStream;
  return { body, contentType: row.contentType };
}
