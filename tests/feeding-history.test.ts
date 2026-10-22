import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminStats, Cat, EventList } from "../lib/contract/schemas";
import { z } from "../lib/contract/registry";
import { call, connectFeeder, eventually, login, shaped } from "./helpers";

const EVENT_TOPIC = "catfeeder/feeder01/event/feeding";

let owner: string;
let admin: string;
let feeder: MqttClient;

beforeAll(async () => {
  owner = await login("OWNER");
  admin = await login("ADMIN");
  feeder = await connectFeeder();
});

afterAll(async () => {
  await feeder.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

const newEventId = () => `feeder01-${randomBytes(4).toString("hex")}`;

/** A feeding event as spec Section 5 shows it, with a fresh event_id. Dated in the past so it sits below real history. */
function feeding(overrides: Record<string, unknown> = {}) {
  return {
    event_id: newEventId(),
    device_id: "feeder01",
    trigger: "schedule",
    schedule_id: "morning-feed",
    command_id: null,
    scheduled_at: "2026-10-01T07:00:00+07:00",
    occurred_at: "2026-10-01T07:00:03+07:00",
    target_portion_g: 40,
    bowl_before_g: 12.4,
    bowl_after_g: 50.9,
    rfid: { result: "tag", tag_id: "E200001A" },
    image_expected: true,
    result: "ok",
    device: { rssi: -61, fw: "0.3.0", queue_len: 0 },
    ...overrides,
  };
}

const send = (event: object, topic = EVENT_TOPIC) => feeder.publishAsync(topic, JSON.stringify(event), { qos: 1 });

async function events(query = "") {
  const { status, body } = await call("GET", `/feeders/feeder01/events${query}`, { token: owner });
  expect(status).toBe(200);
  return shaped(EventList, body).events;
}

async function stats() {
  const { status, body } = await call("GET", "/admin/stats", { token: admin });
  expect(status).toBe(200);
  return shaped(AdminStats, body);
}

const stored = (eventId: string) =>
  eventually(
    async () => (await events("?limit=200")).filter((e) => e.event_id === eventId),
    (found) => found.length > 0,
  );

describe("feeding events from the feeder", () => {
  it("shows a sent event in the history with dispensed_g and Thai-time timestamps", async () => {
    const event = feeding();
    await send(event);
    const [e] = await stored(event.event_id);
    expect(e).toMatchObject({
      event_id: event.event_id,
      feeder_id: "feeder01",
      trigger: "schedule",
      schedule_id: "morning-feed",
      command_id: null,
      scheduled_at: "2026-10-01T07:00:00+07:00",
      occurred_at: "2026-10-01T07:00:03+07:00",
      target_portion_g: 40,
      bowl_before_g: 12.4,
      bowl_after_g: 50.9,
      dispensed_g: 38.5,
      result: "ok",
      image_media_id: null,
    });
    expect(e.received_at).toMatch(/\+07:00$/);
    expect(Math.abs(Date.parse(e.received_at) - Date.now())).toBeLessThan(10_000);
  });

  it("stores an event sent twice once, and counts the rejected duplicate", async () => {
    const before = (await stats()).duplicates_rejected;
    const event = feeding();
    await send(event);
    await stored(event.event_id);
    await send({ ...event, bowl_after_g: 99 }); // a resend must never overwrite the first copy

    const after = await eventually(stats, (s) => s.duplicates_rejected > before);
    expect(after.duplicates_rejected).toBe(before + 1);
    const copies = await stored(event.event_id);
    expect(copies).toHaveLength(1);
    expect(copies[0].bowl_after_g).toBe(50.9);
  });

  it("rejects an event whose payload names a different feeder than its topic", async () => {
    const spoofed = feeding({ device_id: "feeder02" });
    const marker = feeding(); // sent after it on the same connection, so once this is stored the other was handled
    await send(spoofed);
    await send(marker);
    await stored(marker.event_id);
    expect((await events("?limit=200")).map((e) => e.event_id)).not.toContain(spoofed.event_id);
  });
});

describe("polling with since", () => {
  it("does not return an event again when since is that event's own received_at", async () => {
    const event = feeding();
    await send(event);
    const [e] = await stored(event.event_id);
    const again = await events(`?since=${encodeURIComponent(e.received_at)}`);
    expect(again.map((x) => x.event_id)).not.toContain(event.event_id);
  });
});

describe("which cat likely visited", () => {
  it("names the cat for a registered tag", async () => {
    const { body } = await call("GET", "/cats", { token: owner });
    const mochi = z.object({ cats: z.array(Cat) }).parse(body).cats.find((c) => c.rfid_tag === "E200001A")!;
    const event = feeding({ rfid: { result: "tag", tag_id: "E200001A" } });
    await send(event);
    const [e] = await stored(event.event_id);
    expect(e.rfid).toEqual({ result: "tag", tag_id: "E200001A", cat: { id: mochi.id, name: "Mochi" } });
  });

  it.each([
    ["an unregistered tag", { result: "tag", tag_id: "FFFF0000" }],
    ["no tag read", { result: "unknown", tag_id: null }],
    ["several tags at once", { result: "multiple", tag_id: null }],
  ])("shows no cat for %s", async (_, rfid) => {
    const event = feeding({ rfid });
    await send(event);
    const [e] = await stored(event.event_id);
    expect(e.rfid).toEqual({ ...rfid, cat: null });
  });
});
