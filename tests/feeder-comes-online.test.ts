import type { MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeederStatus, ScheduleSaved } from "../lib/contract/schemas";
import { call, connectFeeder, eventually, login, shaped } from "./helpers";

const SCHEDULE_TOPIC = "catfeeder/feeder01/schedule/set";

const STATUS_TOPIC = "catfeeder/feeder01/status";

let owner: string;
let feeder: MqttClient;

beforeAll(async () => {
  owner = await login("OWNER");
  feeder = await connectFeeder();
});

afterAll(async () => {
  // Leave feeder01 offline, as it is with no fake feeder running.
  await feeder.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

async function status() {
  const { status, body } = await call("GET", "/feeders/feeder01/status", { token: owner });
  expect(status).toBe(200);
  return shaped(FeederStatus, body);
}

const report = (payload: object) => feeder.publishAsync(STATUS_TOPIC, JSON.stringify(payload), { qos: 1, retain: true });

describe("feeder status", () => {
  it("shows the feeder online with a Thai-time last_seen and its firmware once it reports", async () => {
    await report({ state: "online", fw: "0.3.0" });
    const s = await eventually(status, (s) => s.state === "online" && s.fw === "0.3.0");
    expect(s).toMatchObject({ feeder_id: "feeder01", state: "online", fw: "0.3.0" });
    expect(s.last_seen).toMatch(/\+07:00$/);
    expect(Math.abs(Date.parse(s.last_seen!) - Date.now())).toBeLessThan(10_000);
  });

  it("flips to offline through the Last Will when the feeder drops without disconnecting", async () => {
    const dropped = await connectFeeder({ keepalive: 1 });
    await dropped.publishAsync(STATUS_TOPIC, '{"state":"online","fw":"0.3.0"}', { qos: 1, retain: true });
    await eventually(status, (s) => s.state === "online");
    dropped.stream.destroy(); // like a power cut: no DISCONNECT, so the broker sends the will
    const s = await eventually(status, (s) => s.state === "offline", 8_000);
    expect(s.state).toBe("offline");
  });

  it("gets the schedule set on connect and after a change, and is synced only once it reports that version", async () => {
    const sets: { schedule_version: number }[] = [];
    feeder.on("message", (topic, payload) => {
      if (topic === SCHEDULE_TOPIC) sets.push(JSON.parse(payload.toString()));
    });
    await feeder.subscribeAsync(SCHEDULE_TOPIC, { qos: 1 });
    const first = await eventually(async () => sets.at(-1), Boolean);
    expect(first?.schedule_version).toBe((await status()).schedule_version);

    await report({ state: "online", schedule_version: first!.schedule_version });
    expect((await eventually(status, (s) => s.synced)).synced).toBe(true);

    const res = await call("POST", "/feeders/feeder01/schedules", { token: owner, body: { time: "10:10", portion_g: 10 } });
    const { schedule, schedule_version } = shaped(ScheduleSaved, res.body);
    expect(await status()).toMatchObject({ schedule_version, applied_schedule_version: first!.schedule_version, synced: false });

    const next = await eventually(async () => sets.at(-1), (s) => s?.schedule_version === schedule_version);
    expect(next?.schedule_version).toBe(schedule_version);
    await report({ state: "online", schedule_version });
    expect(await eventually(status, (s) => s.synced)).toMatchObject({ applied_schedule_version: schedule_version, synced: true });

    await call("DELETE", `/feeders/feeder01/schedules/${schedule.schedule_id}`, { token: owner });
  });
});
