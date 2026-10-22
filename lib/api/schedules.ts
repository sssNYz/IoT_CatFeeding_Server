import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Schedule, ScheduleInput, ScheduleList } from "../contract/schemas";
import { db, schema } from "../db";
import { publish } from "../mqtt";
import { TZ } from "../time";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";
import { ApiError } from "./http";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const { feeders, schedules } = schema;

const toSchedule = (row: typeof schedules.$inferSelect): z.infer<typeof Schedule> => ({
  schedule_id: row.scheduleId,
  time: row.time,
  portion_g: row.portionG,
  sound_id: row.soundId,
  enabled: row.enabled,
});

async function loadSet(feederId: string): Promise<z.infer<typeof ScheduleList>> {
  const [feeder] = await db.select({ version: feeders.scheduleVersion }).from(feeders).where(eq(feeders.id, feederId));
  const rows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.feederId, feederId))
    .orderBy(asc(schedules.time), asc(schedules.scheduleId));
  return { feeder_id: feederId, schedule_version: feeder.version, timezone: TZ, schedules: rows.map(toSchedule) };
}

export async function listSchedules(user: AuthUser, feederId: string) {
  await requireFeeder(user, feederId);
  return loadSet(feederId);
}

/** Lock the feeder row so concurrent changes get versions one after another, then add 1. */
async function bumpVersion(tx: Tx, feederId: string) {
  await tx.select({ id: feeders.id }).from(feeders).where(eq(feeders.id, feederId)).for("update");
  const [{ version }] = await tx
    .update(feeders)
    .set({ scheduleVersion: sql`${feeders.scheduleVersion} + 1` })
    .where(eq(feeders.id, feederId))
    .returning({ version: feeders.scheduleVersion });
  return version;
}

const notFound = (scheduleId: string) => new ApiError(404, "not_found", `Schedule ${scheduleId} not found`);

/** No schedule_id = create (the server makes the id); an existing one = update. Then publish the whole set. */
export async function saveSchedule(user: AuthUser, feederId: string, input: z.infer<typeof ScheduleInput>) {
  await requireFeeder(user, feederId);
  const saved = await db.transaction(async (tx) => {
    const version = await bumpVersion(tx, feederId);
    const fields = { time: input.time, portionG: input.portion_g, enabled: input.enabled };
    let row;
    if (input.schedule_id === undefined) {
      [row] = await tx
        .insert(schedules)
        .values({ feederId, scheduleId: `sch-${randomBytes(4).toString("hex")}`, soundId: input.sound_id ?? null, ...fields })
        .returning();
    } else {
      // Omitting sound_id on an update keeps the sound; send null to remove it.
      [row] = await tx
        .update(schedules)
        .set({ ...fields, ...(input.sound_id !== undefined && { soundId: input.sound_id }) })
        .where(and(eq(schedules.feederId, feederId), eq(schedules.scheduleId, input.schedule_id)))
        .returning();
      if (!row) throw notFound(input.schedule_id);
    }
    return { schedule: toSchedule(row), schedule_version: version };
  });
  await publishSchedules(feederId);
  return saved;
}

export async function deleteSchedule(user: AuthUser, feederId: string, scheduleId: string) {
  await requireFeeder(user, feederId);
  const version = await db.transaction(async (tx) => {
    const version = await bumpVersion(tx, feederId);
    const gone = await tx
      .delete(schedules)
      .where(and(eq(schedules.feederId, feederId), eq(schedules.scheduleId, scheduleId)))
      .returning({ id: schedules.scheduleId });
    if (gone.length === 0) throw notFound(scheduleId);
    return version;
  });
  await publishSchedules(feederId);
  return { schedule_version: version };
}

// One publish at a time per feeder, each reading the set fresh from the database, so the retained message
// always ends on the newest version even when two changes race.
const globalForChains = globalThis as unknown as { scheduleChains?: Map<string, Promise<void>> };
const chains = (globalForChains.scheduleChains ??= new Map());

/**
 * Publish the feeder's whole schedule set to `catfeeder/{id}/schedule/set`, retained, QoS 1 (spec Section 5).
 * Never throws: the change is already saved, and the next publish (or the next app start) carries it.
 */
export function publishSchedules(feederId: string): Promise<void> {
  const next = (chains.get(feederId) ?? Promise.resolve()).then(async () => {
    try {
      const { feeder_id, ...payload } = await loadSet(feederId);
      const acked = await publish(`catfeeder/${feeder_id}/schedule/set`, payload, { retain: true });
      if (!acked) console.warn(`MQTT: schedule v${payload.schedule_version} for ${feederId} not acknowledged yet`);
    } catch (e) {
      console.error(`MQTT: could not publish schedules for ${feederId}:`, e);
    }
  });
  chains.set(feederId, next);
  return next;
}

/** Republish every feeder's set, so the broker's retained messages match the database (app start, reset). */
export async function publishAllSchedules() {
  const rows = await db.select({ id: feeders.id }).from(feeders);
  await Promise.all(rows.map((f) => publishSchedules(f.id)));
}
