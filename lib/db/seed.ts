import { hash } from "bcryptjs";
import { count, sql } from "drizzle-orm";
import { toThai } from "../time";
import { db, schema } from "./index";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/**
 * Test data from .env (spec Section 7): one admin, one owner who owns feeder01 with two daily feeds
 * two cats with RFID tags and about 20 past feeding events, and feeder02 that nobody owns yet (not paired), so "someone else's feeder" can be tried.
 */
export async function seed() {
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      email: env("SEED_ADMIN_EMAIL"),
      passwordHash: await hash(env("SEED_ADMIN_PASSWORD"), 10),
      role: "admin",
    });
    const [owner] = await tx
      .insert(schema.users)
      .values({
        email: env("SEED_OWNER_EMAIL"),
        passwordHash: await hash(env("SEED_OWNER_PASSWORD"), 10),
        role: "owner",
      })
      .returning();
    await tx.insert(schema.feeders).values({
      id: "feeder01",
      ownerId: owner.id,
      name: "Kitchen feeder",
      pairedAt: sql`now()`,
      scheduleVersion: 1,
    });
    await tx.insert(schema.schedules).values([
      { feederId: "feeder01", scheduleId: "morning-feed", time: "07:00", portionG: 40 },
      { feederId: "feeder01", scheduleId: "evening-feed", time: "18:00", portionG: 40 },
    ]);
    await tx.insert(schema.feeders).values({ id: "feeder02", name: "Spare feeder" });
    await tx.insert(schema.cats).values([
      { ownerId: owner.id, name: "Mochi", rfidTag: "E200001A" },
      { ownerId: owner.id, name: "Tora", rfidTag: "E200001B" },
    ]);
    await tx.insert(schema.feedingEvents).values(exampleEvents());
  });
}

type Rfid = { result: "tag" | "unknown" | "multiple"; tag_id: string | null };
type Result = "ok" | "jam" | "missed" | "error";

/**
 * About 20 feedings over the last 10 days, covering every result and rfid.result, so the owner app's
 * history is not empty on day one. Fixed values (no randomness), so every reset looks the same.
 */
function exampleEvents() {
  const MOCHI: Rfid = { result: "tag", tag_id: "E200001A" };
  const TORA: Rfid = { result: "tag", tag_id: "E200001B" };
  const STRAY: Rfid = { result: "tag", tag_id: "E2FF0042" }; // a tag nobody registered
  const NONE: Rfid = { result: "unknown", tag_id: null };
  const BOTH: Rfid = { result: "multiple", tag_id: null };
  // [days ago, "HH:MM" Thai time, trigger, rfid, result, bowl before, bowl after]
  const rows: [number, string, "schedule" | "remote" | "button", Rfid, Result, number | null, number | null][] = [
    [10, "07:00", "schedule", MOCHI, "ok", 8.2, 47.6],
    [10, "18:00", "schedule", TORA, "ok", 3.1, 42.8],
    [9, "07:00", "schedule", MOCHI, "ok", 10.4, 49.9],
    [9, "18:00", "schedule", NONE, "jam", 6.0, 14.5],
    [8, "07:00", "schedule", BOTH, "ok", 4.7, 45.1],
    [8, "12:40", "remote", TORA, "ok", 1.2, 21.0],
    [8, "18:00", "schedule", MOCHI, "ok", 7.5, 46.3],
    [7, "07:00", "schedule", NONE, "missed", null, null],
    [7, "18:00", "schedule", STRAY, "ok", 2.4, 41.0],
    [6, "07:00", "schedule", MOCHI, "ok", 9.9, 48.7],
    [6, "15:20", "button", NONE, "ok", 12.0, 31.6],
    [6, "18:00", "schedule", TORA, "error", 5.5, null],
    [5, "07:00", "schedule", MOCHI, "ok", 6.6, 45.0],
    [5, "18:00", "schedule", MOCHI, "ok", 3.9, 43.2],
    [4, "07:00", "schedule", TORA, "ok", 11.1, 50.4],
    [3, "07:00", "schedule", BOTH, "ok", 5.0, 44.2],
    [3, "18:00", "schedule", NONE, "ok", 8.8, 47.1],
    [2, "07:00", "schedule", MOCHI, "jam", 7.3, 9.0],
    [2, "09:15", "remote", MOCHI, "ok", 2.0, 41.9],
    [1, "07:00", "schedule", TORA, "ok", 4.4, 43.6],
    [1, "18:00", "schedule", MOCHI, "ok", 6.1, 45.8],
  ];
  const today = toThai(new Date()).slice(0, 10);
  return rows.map(([daysAgo, hhmm, trigger, rfid, result, before, after], i) => {
    const day = toThai(new Date(Date.parse(`${today}T12:00:00+07:00`) - daysAgo * 86_400_000)).slice(0, 10);
    const scheduled = trigger === "schedule" ? `${day}T${hhmm}:00+07:00` : null;
    const occurred = `${day}T${hhmm}:03+07:00`;
    const scheduleId = trigger !== "schedule" ? null : hhmm === "07:00" ? "morning-feed" : "evening-feed";
    const target = trigger === "schedule" ? 40 : 20;
    const raw = {
      event_id: `feeder01-seed-${String(i + 1).padStart(2, "0")}`,
      device_id: "feeder01",
      trigger,
      schedule_id: scheduleId,
      command_id: null,
      scheduled_at: scheduled,
      occurred_at: occurred,
      target_portion_g: target,
      bowl_before_g: before,
      bowl_after_g: after,
      rfid,
      image_expected: false,
      result,
      device: { rssi: -60, fw: "0.3.0", queue_len: 0 },
    };
    return {
      eventId: raw.event_id,
      feederId: "feeder01",
      trigger,
      scheduleId,
      scheduledAt: scheduled,
      occurredAt: occurred,
      receivedAt: `${day}T${hhmm}:05+07:00`,
      targetPortionG: target,
      bowlBeforeG: before,
      bowlAfterG: after,
      rfidResult: rfid.result,
      rfidTag: rfid.tag_id,
      result,
      raw,
    };
  });
}

/** Seed only a database with no users yet, so a restart never duplicates or overwrites data. */
export async function seedIfEmpty() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (n > 0) return false;
  await seed();
  return true;
}
