import { publishAllSchedules } from "../lib/api/schedules";
import { pool } from "../lib/db";
import { runMigrations, wipe } from "../lib/db/migrate";
import { seed } from "../lib/db/seed";
import { closeMqtt } from "../lib/mqtt";

await wipe();
await runMigrations();
await seed();
// The broker still holds the old retained schedule sets; replace them with the seeded ones.
await publishAllSchedules();
await closeMqtt();
console.log("Database wiped and reseeded.");
await pool.end();
