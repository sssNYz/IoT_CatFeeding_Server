import { and, asc, count, desc, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { AdminEventsQuery, AdminStats, EventsQuery, FeedingEvent } from "../contract/schemas";
import { FeedResult, RfidResult, ThaiDateTime, Trigger } from "../contract/schemas";
import { db, schema } from "../db";
import { pgToThai } from "../time";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";

const { cats, feedingEvents, media } = schema;

// What a feeder publishes on catfeeder/{id}/event/feeding (spec Section 5). Unknown extra fields are kept in `raw`.
const EventMessage = z.object({
  event_id: z.string().min(1).max(100),
  device_id: z.string(),
  trigger: Trigger,
  schedule_id: z.string().nullable().optional(),
  command_id: z.string().nullable().optional(),
  scheduled_at: ThaiDateTime.nullable().optional(),
  occurred_at: ThaiDateTime,
  target_portion_g: z.number(),
  bowl_before_g: z.number().nullable().optional(),
  bowl_after_g: z.number().nullable().optional(),
  rfid: z.object({ result: RfidResult, tag_id: z.string().nullable().optional() }),
  result: FeedResult,
});

/**
 * Store one feeding event from the feeder (spec Section 9, rules 1 and 6): exactly one row per event_id,
 * the first copy wins, and every resend is counted in duplicate_events. received_at comes from the database.
 */
export async function ingestEvent(feederId: string, message: unknown) {
  const parsed = EventMessage.safeParse(message);
  if (!parsed.success) return console.warn(`MQTT: bad event from ${feederId}:`, parsed.error.issues[0].message);
  const e = parsed.data;
  // The ACL proves which feeder sent it (topic); a payload naming another feeder is a bug or a spoof.
  if (e.device_id !== feederId) return console.warn(`MQTT: ${feederId} sent an event for ${e.device_id}; dropped`);
  const inserted = await db
    .insert(feedingEvents)
    .values({
      eventId: e.event_id,
      feederId,
      trigger: e.trigger,
      scheduleId: e.schedule_id ?? null,
      commandId: e.command_id ?? null,
      scheduledAt: e.scheduled_at ?? null,
      occurredAt: e.occurred_at,
      targetPortionG: e.target_portion_g,
      bowlBeforeG: e.bowl_before_g ?? null,
      bowlAfterG: e.bowl_after_g ?? null,
      rfidResult: e.rfid.result,
      rfidTag: e.rfid.tag_id ?? null,
      result: e.result,
      raw: message as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: feedingEvents.eventId })
    .returning({ id: feedingEvents.eventId });
  if (inserted.length === 0) {
    await db.insert(schema.duplicateEvents).values({ eventId: e.event_id, feederId });
    return;
  }
  // A feeding for a "Feed now" marks that command done (rule 3). The first event for a command wins.
  if (e.command_id) {
    await db
      .update(schema.commands)
      .set({ doneEventId: e.event_id })
      .where(
        and(
          eq(schema.commands.commandId, e.command_id),
          eq(schema.commands.feederId, feederId),
          isNull(schema.commands.doneEventId),
        ),
      );
  }
}

type CatRef = { id: string; name: string } | null;

const toEvent = (
  row: typeof feedingEvents.$inferSelect,
  cat: CatRef,
  imageMediaId: string | null,
): z.infer<typeof FeedingEvent> => ({
  event_id: row.eventId,
  feeder_id: row.feederId,
  trigger: row.trigger,
  schedule_id: row.scheduleId,
  command_id: row.commandId,
  scheduled_at: pgToThai(row.scheduledAt),
  occurred_at: pgToThai(row.occurredAt),
  received_at: pgToThai(row.receivedAt, { millis: true }),
  target_portion_g: row.targetPortionG,
  bowl_before_g: row.bowlBeforeG,
  bowl_after_g: row.bowlAfterG,
  dispensed_g: row.bowlBeforeG === null || row.bowlAfterG === null ? null : subtract(row.bowlAfterG, row.bowlBeforeG),
  rfid: { result: row.rfidResult, tag_id: row.rfidTag, cat: row.rfidResult === "tag" ? cat : null },
  result: row.result,
  image_media_id: imageMediaId,
});

// Grams have at most a few decimals; round away float noise (50.9 − 12.4 = 38.49999…).
const subtract = (a: number, b: number) => Math.round((a - b) * 1000) / 1000;

/**
 * History for one feeder, newest occurred_at first. from/to filter occurred_at (the history screen);
 * since filters received_at (the 5-second poll), so late events from an outage still reach the app.
 */
export async function listEvents(user: AuthUser, feederId: string, query: z.infer<typeof EventsQuery>) {
  await requireFeeder(user, feederId);
  const rows = await selectEvents({ feederId }, query, "newest", query.limit ?? 50);
  return rows.map((r) => r.event);
}

/** Every feeder's events for the admin, newest first, each with the exact payload the feeder sent. */
export async function listAdminEvents(query: z.infer<typeof AdminEventsQuery>) {
  const rows = await selectEvents({ feederId: query.feeder, result: query.result }, query, "newest", query.limit ?? 50);
  return rows.map((r) => ({ ...r.event, raw: r.raw }));
}

// The paper's analysis notebook reads these columns (spec Section 10); values are the same as in the history.
const CSV_COLUMNS = [
  "event_id", "feeder_id", "trigger", "schedule_id", "command_id", "scheduled_at", "occurred_at", "received_at",
  "target_portion_g", "bowl_before_g", "bowl_after_g", "dispensed_g", "rfid_result", "rfid_tag", "cat_name", "result",
  "image_media_id",
] as const;

/** Every feeding of one feeder as CSV, oldest occurred_at first, optionally within from/to (admin only). */
export async function exportEventsCsv(user: AuthUser, feederId: string, query: Pick<z.infer<typeof EventsQuery>, "from" | "to">) {
  await requireFeeder(user, feederId);
  const lines = (await selectEvents({ feederId }, query, "oldest")).map(({ event: e }) => {
    const row: Record<(typeof CSV_COLUMNS)[number], string | number | null> = {
      ...e,
      rfid_result: e.rfid.result,
      rfid_tag: e.rfid.tag_id,
      cat_name: e.rfid.cat?.name ?? null,
    };
    return CSV_COLUMNS.map((c) => csvField(row[c])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}

// RFC 4180: quote a field holding a comma, quote or line break (a cat's name could), doubling inner quotes.
const csvField = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function selectEvents(
  only: { feederId?: string; result?: z.infer<typeof FeedResult> },
  query: Pick<z.infer<typeof EventsQuery>, "from" | "to" | "since">,
  order: "newest" | "oldest",
  limit?: number,
) {
  // The cat's name and the photo are both joined at read time: a cat registered after its visits still shows
  // up, and a photo links to its event by event_id whichever arrived first (ADR 0001).
  const select = db
    .select({ event: feedingEvents, cat: { id: cats.id, name: cats.name }, imageId: media.id })
    .from(feedingEvents)
    .leftJoin(cats, eq(cats.rfidTag, feedingEvents.rfidTag))
    .leftJoin(
      media,
      and(eq(media.feederId, feedingEvents.feederId), eq(media.eventId, feedingEvents.eventId), eq(media.kind, "image")),
    )
    .where(
      and(
        only.feederId === undefined ? undefined : eq(feedingEvents.feederId, only.feederId),
        only.result === undefined ? undefined : eq(feedingEvents.result, only.result),
        query.from === undefined ? undefined : gte(feedingEvents.occurredAt, query.from),
        query.to === undefined ? undefined : lt(feedingEvents.occurredAt, query.to),
        query.since === undefined ? undefined : gt(feedingEvents.receivedAt, query.since),
      ),
    )
    .orderBy(
      ...(order === "newest"
        ? [desc(feedingEvents.occurredAt), desc(feedingEvents.eventId)]
        : [asc(feedingEvents.occurredAt), asc(feedingEvents.eventId)]),
    )
    .$dynamic();
  const rows = await (limit === undefined ? select : select.limit(limit));
  return rows.map((r) => ({ event: toEvent(r.event, r.cat, r.imageId), raw: r.event.raw }));
}

/** Totals for the admin dashboard and the paper: events stored, duplicates rejected (objective 4), failures. */
export async function eventStats(): Promise<z.infer<typeof AdminStats>> {
  const byResult = await db
    .select({ result: feedingEvents.result, n: count() })
    .from(feedingEvents)
    .groupBy(feedingEvents.result);
  const [{ n: duplicates }] = await db.select({ n: count() }).from(schema.duplicateEvents);
  const of = (result: string) => byResult.find((r) => r.result === result)?.n ?? 0;
  return {
    events_total: byResult.reduce((sum, r) => sum + r.n, 0),
    duplicates_rejected: duplicates,
    failed: { jam: of("jam"), missed: of("missed"), error: of("error") },
  };
}
