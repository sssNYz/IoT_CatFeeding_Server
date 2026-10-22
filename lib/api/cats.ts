import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Cat, CatInput } from "../contract/schemas";
import { db, schema } from "../db";
import type { AuthUser } from "./auth";
import { ApiError } from "./http";

const { cats } = schema;

const toCat = (row: typeof cats.$inferSelect): z.infer<typeof Cat> => ({
  id: row.id,
  name: row.name,
  rfid_tag: row.rfidTag,
});

/** Cats the user may see (owner: their own; admin: all). */
export async function listCats(user: AuthUser) {
  const rows = await db
    .select()
    .from(cats)
    .where(user.role === "admin" ? undefined : eq(cats.ownerId, user.id))
    .orderBy(cats.name, cats.rfidTag);
  return rows.map(toCat);
}

/** Tags are unique across the system: a tag someone already registered is a 409, even for two requests at once. */
export async function createCat(user: AuthUser, input: z.infer<typeof CatInput>) {
  const [row] = await db
    .insert(cats)
    .values({ ownerId: user.id, name: input.name, rfidTag: input.rfid_tag })
    .onConflictDoNothing({ target: cats.rfidTag })
    .returning();
  if (!row) throw new ApiError(409, "conflict", `RFID tag ${input.rfid_tag} is already registered`);
  return toCat(row);
}
