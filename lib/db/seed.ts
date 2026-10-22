import { hash } from "bcryptjs";
import { count, sql } from "drizzle-orm";
import { db, schema } from "./index";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/**
 * Test data from .env (spec Section 7): one admin, one owner who owns feeder01 with two daily feeds
 * and two cats with RFID tags, and feeder02 that nobody owns yet (not paired), so "someone else's feeder" can be tried.
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
  });
}

/** Seed only a database with no users yet, so a restart never duplicates or overwrites data. */
export async function seedIfEmpty() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (n > 0) return false;
  await seed();
  return true;
}
