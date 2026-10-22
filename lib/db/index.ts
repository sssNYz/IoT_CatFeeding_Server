import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// One pool per server process (survives Next.js dev reloads).
const globalForDb = globalThis as unknown as { pool?: Pool };
export const pool = (globalForDb.pool ??= new Pool({ connectionString: process.env.DATABASE_URL }));

export const db = drizzle(pool, { schema });
export { schema };
