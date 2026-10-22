import { and, count, desc, eq, gt, gte, lt } from "drizzle-orm";
import { z } from "zod";
import type { AdminStats, EventsQuery, FeedingEvent } from "../contract/schemas";
import { FeedResult, RfidResult, ThaiDateTime, Trigger } from "../contract/schemas";
import { db, schema } from "../db";
import { pgToThai } from "../time";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";

const { cats, feedingEvents } = schema;

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
  if (inserted.length === 0) await db.insert(schema.duplicateEvents).values({ eventId: e.event_id, feederId });
}

type CatRef = { id: string; name: string } | null;

const toEvent = (row: typeof feedingEvents.$inferSelect, cat: CatRef): z.infer<typeof FeedingEvent> => ({
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
  image_media_id: null,
});

// Grams have at most a few decimals; round away float noise (50.9 − 12.4 = 38.49999…).
const subtract = (a: number, b: number) => Math.round((a - b) * 1000) / 1000;

/**
 * History for one feeder, newest occurred_at first. from/to filter occurred_at (the history screen);
 * since filters received_at (the 5-second poll), so late events from an outage still reach the app.
 */
export async function listEvents(user: AuthUser, feederId: string, query: z.infer<typeof EventsQuery>) {
  await requireFeeder(user, feederId);
  // The cat's name comes from the tag at read time, so a cat registered after its visits still shows up.
  const rows = await db
    .select({ event: feedingEvents, cat: { id: cats.id, name: cats.name } })
    .from(feedingEvents)
    .leftJoin(cats, eq(cats.rfidTag, feedingEvents.rfidTag))
    .where(
      and(
        eq(feedingEvents.feederId, feederId),
        query.from === undefined ? undefined : gte(feedingEvents.occurredAt, query.from),
        query.to === undefined ? undefined : lt(feedingEvents.occurredAt, query.to),
        query.since === undefined ? undefined : gt(feedingEvents.receivedAt, query.since),
      ),
    )
    .orderBy(desc(feedingEvents.occurredAt), desc(feedingEvents.eventId))
    .limit(query.limit ?? 50);
  return rows.map((r) => toEvent(r.event, r.cat));
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
