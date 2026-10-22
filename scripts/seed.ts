import { pool } from "../lib/db";
import { runMigrations } from "../lib/db/migrate";
import { seedIfEmpty } from "../lib/db/seed";

await runMigrations();
console.log((await seedIfEmpty()) ? "Seeded." : "Database already has users; nothing to do. Use `npm run reset` to start over.");
await pool.end();
