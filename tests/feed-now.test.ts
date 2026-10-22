import type { MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { EventList, FeedCommand } from "../lib/contract/schemas";
import { call, connectFeeder, errorShaped, eventually, login, shaped } from "./helpers";

const COMMAND_TOPIC = "catfeeder/feeder01/command/feed";

type Received = { topic: string; retain: boolean; body: Record<string, unknown> };

let owner: string;
let feeder: MqttClient;
const received: Received[] = [];

beforeAll(async () => {
  owner = await login("OWNER");
  feeder = await connectFeeder();
  feeder.on("message", (topic, payload, packet) => {
    if (topic === COMMAND_TOPIC) received.push({ topic, retain: packet.retain, body: JSON.parse(payload.toString()) });
  });
  await feeder.subscribeAsync(COMMAND_TOPIC, { qos: 1 });
});

afterAll(async () => {
  await feeder.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

async function feedNow(body: object = { portion_g: 20 }) {
  const res = await call("POST", "/feeders/feeder01/commands/feed", { token: owner, body });
  expect(res.status).toBe(202);
  return shaped(FeedCommand, res.body);
}

/** The command the feeder got over MQTT, waiting briefly for it to arrive. */
async function commandOnFeeder(commandId: string) {
  for (let i = 0; i < 25; i++) {
    const hit = received.find((r) => r.body.command_id === commandId);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

async function command(commandId: string) {
  const res = await call("GET", `/feeders/feeder01/commands/${commandId}`, { token: owner });
  expect(res.status).toBe(200);
  return shaped(FeedCommand, res.body);
}

/** What the feeder sends after acting on a command: a remote feeding event carrying its command_id. */
function remoteFeeding(commandId: string, portion: number, issuedAt: string) {
  return {
    event_id: `feeder01-${randomBytes(4).toString("hex")}`,
    device_id: "feeder01",
    trigger: "remote",
    schedule_id: null,
    command_id: commandId,
    scheduled_at: null,
    occurred_at: issuedAt,
    target_portion_g: portion,
    bowl_before_g: 5.0,
    bowl_after_g: 24.6,
    rfid: { result: "unknown", tag_id: null },
    image_expected: false,
    result: "ok",
  };
}

describe("POST /feeders/{id}/commands/feed", () => {
  it("answers 202 sent with a Thai-time issued_at, and the feeder gets the command, not retained", async () => {
    const cmd = await feedNow({ portion_g: 20, sound_id: "snd-01" });
    expect(cmd).toMatchObject({ feeder_id: "feeder01", portion_g: 20, status: "sent", event_id: null });
    expect(cmd.issued_at).toMatch(/\+07:00$/);
    expect(Math.abs(Date.parse(cmd.issued_at) - Date.now())).toBeLessThan(10_000);

    const got = await commandOnFeeder(cmd.command_id);
    expect(got?.retain).toBe(false);
    expect(got?.body).toEqual({ command_id: cmd.command_id, portion_g: 20, sound_id: "snd-01", issued_at: cmd.issued_at });
  });
});

describe("GET /feeders/{id}/commands/{command_id}", () => {
  it("stays sent until the feeder reports a feeding for it, then is done with that event", async () => {
    const cmd = await feedNow({ portion_g: 20 });
    expect((await command(cmd.command_id)).status).toBe("sent");

    const event = remoteFeeding(cmd.command_id, 20, cmd.issued_at);
    await feeder.publishAsync("catfeeder/feeder01/event/feeding", JSON.stringify(event), { qos: 1 });
    const done = await eventually(() => command(cmd.command_id), (c) => c.status === "done");
    expect(done).toEqual({ ...cmd, status: "done", event_id: event.event_id });

    const { body } = await call("GET", "/feeders/feeder01/events?limit=200", { token: owner });
    const inHistory = shaped(EventList, body).events.find((e) => e.event_id === event.event_id);
    expect(inHistory).toMatchObject({ trigger: "remote", command_id: cmd.command_id, dispensed_g: 19.6 });
  });
});

describe("refused feeds", () => {
  it.each([4, 101, 20.5])("returns 422 naming portion_g for %s g", async (portion_g) => {
    const res = await call("POST", "/feeders/feeder01/commands/feed", { token: owner, body: { portion_g } });
    expect(res.status).toBe(422);
    expect(errorShaped(res.body).details?.map((d) => d.field)).toEqual(["portion_g"]);
  });

  it("returns 403 for a feeder the owner does not own", async () => {
    const res = await call("POST", "/feeders/feeder02/commands/feed", { token: owner, body: { portion_g: 20 } });
    expect(res.status).toBe(403);
    expect(errorShaped(res.body).code).toBe("forbidden");
  });

  it("returns 404 for an unknown feeder or command", async () => {
    expect((await call("POST", "/feeders/feeder99/commands/feed", { token: owner, body: { portion_g: 20 } })).status).toBe(404);
    expect((await call("GET", "/feeders/feeder01/commands/cmd-nope", { token: owner })).status).toBe(404);
  });
});
