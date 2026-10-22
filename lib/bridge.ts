import { sql } from "drizzle-orm";
import { z } from "zod";
import { publishAllSchedules } from "./api/schedules";
import { db, schema } from "./db";
import { mqttClient } from "./mqtt";

// What a feeder publishes on catfeeder/{id}/status (spec Section 5); its Last Will is {"state":"offline"}.
const StatusMessage = z.object({
  state: z.enum(["online", "offline"]),
  schedule_version: z.number().int().optional(),
  fw: z.string().optional(),
});

/** Record a status report: state and last_seen always, fw and applied version only when the feeder sends them. */
async function onStatus(feederId: string, payload: Buffer) {
  if (payload.length === 0) return; // a cleared retained message
  const parsed = StatusMessage.safeParse(JSON.parse(payload.toString()));
  if (!parsed.success) return console.warn(`MQTT: bad status from ${feederId}:`, parsed.error.issues[0].message);
  const { state, fw, schedule_version } = parsed.data;
  const known = { ...(fw !== undefined && { fw }), ...(schedule_version !== undefined && { appliedScheduleVersion: schedule_version }) };
  await db
    .insert(schema.deviceStatus)
    .values({ feederId, state, lastSeen: sql`now()`, ...known })
    .onConflictDoUpdate({ target: schema.deviceStatus.feederId, set: { state, lastSeen: sql`now()`, ...known } });
}

/**
 * The server side of MQTT (spec Section 9): follow every feeder's status, and on each (re)connect
 * re-send every schedule set so the broker's retained messages match the database.
 */
export function startBridge() {
  const client = mqttClient();
  client.on("connect", () => void publishAllSchedules().catch(console.error));
  client.subscribe("catfeeder/+/status", { qos: 1 });
  client.on("message", (topic, payload) => {
    const [, feederId, kind] = topic.split("/");
    if (kind !== "status") return;
    onStatus(feederId, payload).catch((e) => console.error(`MQTT: status from ${feederId}:`, e));
  });
}
