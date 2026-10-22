import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db } from "./index";

export const runMigrations = () => migrate(db, { migrationsFolder: "drizzle" });

/** Drop every table, so the next migrate + seed starts from empty. */
export async function wipe() {
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
}
