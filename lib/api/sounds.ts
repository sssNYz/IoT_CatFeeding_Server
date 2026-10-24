import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import type { Sound } from "../contract/schemas";
import { db, schema } from "../db";
import { getObject, putObject } from "../storage";
import { pgToThai } from "../time";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";
import { ApiError, invalid } from "./http";

const run = promisify(execFile);
const { media } = schema;

const MAX_SOUND_BYTES = 2 * 1024 * 1024; // contract: any phone recording, max 2 MB
const MP3 = "audio/mpeg";
// What the main ESP32 plays (spec Section 9, rule 7): MP3, mono, 16 kHz.
const FFMPEG_OUT = ["-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3"];
const FFMPEG_TIMEOUT_MS = 20_000;

/** Read the owner app's multipart upload: a name and a recording of at most 2 MB. */
export async function readSoundUpload(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_SOUND_BYTES + 16 * 1024) {
    throw invalid("file", "Must be at most 2 MB");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw invalid("body", "Must be multipart/form-data with name and file");
  }
  const name = form.get("name");
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 40) {
    throw invalid("name", "Must be 1 to 40 characters");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw invalid("file", "Missing: attach the recording as file");
  if (file.size > MAX_SOUND_BYTES) throw invalid("file", "Must be at most 2 MB");
  return { name: name.trim(), data: Buffer.from(await file.arrayBuffer()) };
}

/**
 * Convert any recording ffmpeg understands to the feeder's MP3 and measure it. Through files, not pipes:
 * a phone's m4a keeps its index at the end, which ffmpeg cannot read from a pipe.
 */
async function toFeederMp3(data: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "sound-"));
  try {
    const input = join(dir, "in");
    const output = join(dir, "out.mp3");
    await writeFile(input, data);
    try {
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", input, ...FFMPEG_OUT, output], {
        timeout: FFMPEG_TIMEOUT_MS,
      });
    } catch {
      throw invalid("file", "Must be an audio recording (m4a, aac, mp3 or wav)");
    }
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output]);
    const duration = Number.parseFloat(stdout);
    return { mp3: await readFile(output), durationS: Number.isFinite(duration) ? Math.round(duration * 100) / 100 : null };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toSound(row: typeof media.$inferSelect): z.infer<typeof Sound> {
  return {
    sound_id: row.soundId!,
    name: row.name ?? "",
    media_id: row.id,
    duration_s: row.durationS,
    created_at: pgToThai(row.createdAt),
  };
}

/** Convert and store a feeding sound for a feeder the user may change (spec Section 9, rule 7). */
export async function saveSound(user: AuthUser, feederId: string, upload: { name: string; data: Buffer }) {
  await requireFeeder(user, feederId);
  const { mp3, durationS } = await toFeederMp3(upload.data);
  const soundId = `snd-${randomBytes(4).toString("hex")}`;
  const objectKey = `sounds/${feederId}/${soundId}.mp3`;
  await putObject(objectKey, mp3, MP3);
  const [row] = await db
    .insert(media)
    .values({ feederId, kind: "sound", objectKey, soundId, name: upload.name, durationS, contentType: MP3 })
    .returning();
  return toSound(row);
}

/** The feeder's sounds, oldest first, for picking one in a schedule or Feed now. */
export async function listSounds(user: AuthUser, feederId: string) {
  await requireFeeder(user, feederId);
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.feederId, feederId), eq(media.kind, "sound")))
    .orderBy(asc(media.createdAt));
  return rows.map(toSound);
}

/** One of this feeder's sounds as an MP3 stream, for the main ESP32 to cache. */
export async function openFeederSound(feederId: string, soundId: string) {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.feederId, feederId), eq(media.kind, "sound"), eq(media.soundId, soundId)));
  if (!row) throw new ApiError(404, "not_found", `Sound ${soundId} not found`);
  return Readable.toWeb(await getObject(row.objectKey)) as ReadableStream;
}
