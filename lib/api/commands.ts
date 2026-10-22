import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { FeedCommand, FeedCommandRequest } from "../contract/schemas";
import { db, schema } from "../db";
import { publish } from "../mqtt";
import { nowTh, pgToThai } from "../time";
import type { AuthUser } from "./auth";
import { requireFeeder } from "./feeders";
import { ApiError } from "./http";

const { commands } = schema;

const toCommand = (row: typeof commands.$inferSelect): z.infer<typeof FeedCommand> => ({
  command_id: row.commandId,
  feeder_id: row.feederId,
  portion_g: row.portionG,
  issued_at: pgToThai(row.issuedAt),
  status: row.doneEventId === null ? "sent" : "done",
  event_id: row.doneEventId,
});

/**
 * Feed now (spec Section 9, rule 3): save the command, publish it to command/feed at QoS 1, not retained,
 * with issued_at, and answer "sent". The feeder ignores a command older than 60 s (rule 9).
 */
export async function feedNow(user: AuthUser, feederId: string, input: z.infer<typeof FeedCommandRequest>) {
  await requireFeeder(user, feederId);
  const [row] = await db
    .insert(commands)
    .values({
      commandId: `cmd-${randomUUID()}`,
      feederId,
      portionG: input.portion_g,
      soundId: input.sound_id ?? null,
      issuedBy: user.id,
      issuedAt: nowTh(),
    })
    .returning();
  const command = toCommand(row);
  const message = {
    command_id: command.command_id,
    portion_g: command.portion_g,
    sound_id: row.soundId,
    issued_at: command.issued_at,
  };
  if (!(await publish(`catfeeder/${feederId}/command/feed`, message))) {
    console.warn(`MQTT: feed command ${command.command_id} for ${feederId} not acknowledged yet`);
  }
  return command;
}

/** A manual feed's progress: sent until its feeding event arrives, then done with that event_id. */
export async function getCommand(user: AuthUser, feederId: string, commandId: string) {
  await requireFeeder(user, feederId);
  const [row] = await db
    .select()
    .from(commands)
    .where(and(eq(commands.commandId, commandId), eq(commands.feederId, feederId)));
  if (!row) throw new ApiError(404, "not_found", `Command ${commandId} not found`);
  return toCommand(row);
}
