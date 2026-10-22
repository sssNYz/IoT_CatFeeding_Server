import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Feeder } from "../contract/schemas";
import { db, schema } from "../db";
import { pgToThai } from "../time";
import type { AuthUser } from "./auth";

/** Feeders the user may see (owner: their own; admin: all), each with its status. */
export async function listFeeders(user: AuthUser): Promise<z.infer<typeof Feeder>[]> {
  const { feeders, deviceStatus } = schema;
  const rows = await db
    .select()
    .from(feeders)
    .leftJoin(deviceStatus, eq(deviceStatus.feederId, feeders.id))
    .where(user.role === "admin" ? undefined : eq(feeders.ownerId, user.id))
    .orderBy(feeders.id);

  return rows.map(({ feeders: f, device_status: s }) => ({
    id: f.id,
    name: f.name,
    owner_id: f.ownerId,
    paired_at: pgToThai(f.pairedAt),
    status: {
      feeder_id: f.id,
      state: s?.state ?? "unknown",
      last_seen: pgToThai(s?.lastSeen ?? null),
      fw: s?.fw ?? null,
      schedule_version: f.scheduleVersion,
      applied_schedule_version: s?.appliedScheduleVersion ?? null,
      synced: s?.appliedScheduleVersion === f.scheduleVersion,
    },
  }));
}
