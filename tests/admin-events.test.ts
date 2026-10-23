import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminEvent } from "../lib/contract/schemas";
import { call, connectFeeder, errorShaped, eventually, login, shaped } from "./helpers";

const AdminEventList = z.object({ events: z.array(AdminEvent) });

let admin: string;
let owner: string;
let feeder: MqttClient;

beforeAll(async () => {
  [admin, owner] = await Promise.all([login("ADMIN"), login("OWNER")]);
  feeder = await connectFeeder();
});

afterAll(async () => {
  await feeder.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

/** Publish one feeding as feeder01 and return the exact payload sent. */
async function feed(fields: Record<string, unknown> = {}) {
  const payload = {
    event_id: `feeder01-adm-${randomBytes(4).toString("hex")}`,
    device_id: "feeder01",
    trigger: "button",
    occurred_at: "2026-09-20T12:00:00+07:00",
    target_portion_g: 20,
    bowl_before_g: 2,
    bowl_after_g: 21.5,
    rfid: { result: "unknown", tag_id: null },
    image_expected: false,
    result: "ok",
    device: { rssi: -58, fw: "0.3.0", queue_len: 0 },
    ...fields,
  };
  await feeder.publishAsync("catfeeder/feeder01/event/feeding", JSON.stringify(payload), { qos: 1 });
  return payload;
}

async function adminEvents(query = "", token = admin) {
  const { status, body } = await call("GET", `/admin/events${query}`, { token });
  return { status, body };
}

const listed = async (query = "") => shaped(AdminEventList, (await adminEvents(query)).body).events;

describe("GET /admin/events", () => {
  it("shows the admin each event with the exact payload the feeder sent", async () => {
    const sent = await feed();
    const events = await eventually(() => listed(), (es) => es.some((e) => e.event_id === sent.event_id));
    const event = events.find((e) => e.event_id === sent.event_id);
    expect(event).toMatchObject({ feeder_id: "feeder01", trigger: "button", dispensed_g: 19.5, result: "ok" });
    expect(event?.raw).toEqual(sent);
  });

  it("narrows to one result", async () => {
    const jam = await feed({ result: "jam", bowl_after_g: 4 });
    const jams = await eventually(() => listed("?result=jam&limit=200"), (es) => es.some((e) => e.event_id === jam.event_id));
    expect(jams.length).toBeGreaterThan(1); // the seed has jams too
    expect(jams.every((e) => e.result === "jam")).toBe(true);
  });

  it("narrows to one feeder", async () => {
    const sent = await feed();
    await eventually(() => listed(), (es) => es.some((e) => e.event_id === sent.event_id));
    expect(await listed("?feeder=feeder02")).toEqual([]);
    expect((await listed("?feeder=feeder01")).some((e) => e.event_id === sent.event_id)).toBe(true);
  });

  it("with since, still shows an event that happened long ago but arrived late", async () => {
    const [newest] = await listed();
    const late = await feed({ occurred_at: "2026-01-02T08:00:00+07:00" });
    const events = await eventually(
      () => listed(`?since=${encodeURIComponent(newest.received_at)}`),
      (es) => es.some((e) => e.event_id === late.event_id),
    );
    expect(events.map((e) => e.event_id)).toContain(late.event_id);
  });

  it("is for the admin only: the owner gets 403", async () => {
    const { status, body } = await adminEvents("", owner);
    expect(status).toBe(403);
    expect(errorShaped(body).code).toBe("forbidden");
  });

  it("rejects a result that does not exist with 422", async () => {
    const { status, body } = await adminEvents("?result=burnt");
    expect(status).toBe(422);
    expect(errorShaped(body).details?.[0].field).toBe("result");
  });
});
