import { pool } from "../lib/db";
import { runMigrations, wipe } from "../lib/db/migrate";
import { seed } from "../lib/db/seed";

await wipe();
await runMigrations();
await seed();
console.log("Database wiped and reseeded.");
await pool.end();
