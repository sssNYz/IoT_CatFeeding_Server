import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScheduleDeleted, ScheduleList, ScheduleSaved } from "../lib/contract/schemas";
import { call, errorShaped, login, retained, shaped } from "./helpers";

const PATH = "/feeders/feeder01/schedules";
const TOPIC = "catfeeder/feeder01/schedule/set";

let owner: string;
const created: string[] = [];

beforeAll(async () => {
  owner = await login("OWNER");
});

afterAll(async () => {
  for (const id of created) await call("DELETE", `${PATH}/${id}`, { token: owner });
});

async function list(token = owner) {
  const { status, body } = await call("GET", PATH, { token });
  expect(status).toBe(200);
  return shaped(ScheduleList, body);
}

async function create(body: object) {
  const res = await call("POST", PATH, { token: owner, body });
  expect(res.status).toBe(201);
  const saved = shaped(ScheduleSaved, res.body);
  created.push(saved.schedule.schedule_id);
  return saved;
}

describe("GET /feeders/{id}/schedules", () => {
  it("lists the seeded 07:00 and 18:00 feeds with the version and Thai time zone", async () => {
    const set = await list();
    expect(set).toMatchObject({ feeder_id: "feeder01", timezone: "Asia/Bangkok" });
    expect(set.schedule_version).toBeGreaterThanOrEqual(1);
    expect(set.schedules).toEqual(
      expect.arrayContaining([
        { schedule_id: "morning-feed", time: "07:00", portion_g: 40, sound_id: null, enabled: true },
        { schedule_id: "evening-feed", time: "18:00", portion_g: 40, sound_id: null, enabled: true },
      ]),
    );
  });

  it("lets the admin see any feeder's schedules", async () => {
    expect((await list(await login("ADMIN"))).feeder_id).toBe("feeder01");
  });

  it("returns 401 without a token", async () => {
    expect((await call("GET", PATH)).status).toBe(401);
  });
});

describe("POST /feeders/{id}/schedules", () => {
  it("creates a schedule with a server-made id and raises the version by one", async () => {
    const before = (await list()).schedule_version;
    const saved = await create({ time: "12:30", portion_g: 25, sound_id: "snd-01" });
    expect(saved.schedule_version).toBe(before + 1);
    expect(saved.schedule).toMatchObject({ time: "12:30", portion_g: 25, sound_id: "snd-01", enabled: true });
    expect(saved.schedule.schedule_id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect((await list()).schedules).toContainEqual(saved.schedule);
  });

  it("updates an existing schedule and keeps its sound when sound_id is left out", async () => {
    const { schedule } = await create({ time: "13:00", portion_g: 30, sound_id: "snd-02" });
    const before = (await list()).schedule_version;
    const res = await call("POST", PATH, {
      token: owner,
      body: { schedule_id: schedule.schedule_id, time: "13:15", portion_g: 35, enabled: false },
    });
    expect(res.status).toBe(201);
    const saved = shaped(ScheduleSaved, res.body);
    expect(saved.schedule_version).toBe(before + 1);
    expect(saved.schedule).toEqual({ ...schedule, time: "13:15", portion_g: 35, enabled: false });
  });

  it("returns 404 for a schedule_id that does not exist, without raising the version", async () => {
    const before = (await list()).schedule_version;
    const res = await call("POST", PATH, { token: owner, body: { schedule_id: "no-such-feed", time: "09:00", portion_g: 20 } });
    expect(res.status).toBe(404);
    expect(errorShaped(res.body).code).toBe("not_found");
    expect((await list()).schedule_version).toBe(before);
  });

  it.each([
    ["time", { time: "7:00", portion_g: 40 }],
    ["time", { time: "24:00", portion_g: 40 }],
    ["portion_g", { time: "07:00", portion_g: 4 }],
    ["portion_g", { time: "07:00", portion_g: 101 }],
  ])("returns 422 naming %s for %j", async (field, body) => {
    const res = await call("POST", PATH, { token: owner, body });
    expect(res.status).toBe(422);
    const error = errorShaped(res.body);
    expect(error.code).toBe("validation_error");
    expect(error.details?.map((d) => d.field)).toEqual([field]);
  });
});

describe("DELETE /feeders/{id}/schedules/{schedule_id}", () => {
  it("removes the schedule and returns the new version", async () => {
    const { schedule, schedule_version } = await create({ time: "15:00", portion_g: 20 });
    const res = await call("DELETE", `${PATH}/${schedule.schedule_id}`, { token: owner });
    expect(res.status).toBe(200);
    expect(shaped(ScheduleDeleted, res.body).schedule_version).toBe(schedule_version + 1);
    expect((await list()).schedules.map((s) => s.schedule_id)).not.toContain(schedule.schedule_id);
  });

  it("returns 404 for a schedule that does not exist", async () => {
    const res = await call("DELETE", `${PATH}/no-such-feed`, { token: owner });
    expect(res.status).toBe(404);
    expect(errorShaped(res.body).code).toBe("not_found");
  });
});

describe("schedule/set over MQTT", () => {
  it("holds the whole newest set as a retained message after a change", async () => {
    await create({ time: "16:45", portion_g: 15 });
    const { feeder_id, ...set } = await list();
    expect(await retained(TOPIC)).toEqual(set);
  });

  it("still holds the newest set after a delete", async () => {
    const { schedule } = await create({ time: "17:10", portion_g: 15 });
    await call("DELETE", `${PATH}/${schedule.schedule_id}`, { token: owner });
    const { feeder_id, ...set } = await list();
    expect(await retained(TOPIC)).toEqual(set);
  });
});

describe("access", () => {
  it.each([
    ["GET", "/feeders/feeder02/schedules", undefined],
    ["POST", "/feeders/feeder02/schedules", { time: "07:00", portion_g: 40 }],
    ["DELETE", "/feeders/feeder02/schedules/morning-feed", undefined],
  ])("returns 403 for %s on a feeder the owner does not own", async (method, path, body) => {
    const res = await call(method, path, { token: owner, body });
    expect(res.status).toBe(403);
    expect(errorShaped(res.body).code).toBe("forbidden");
  });

  it.each([
    ["GET", "/feeders/feeder99/schedules", undefined],
    ["POST", "/feeders/feeder99/schedules", { time: "07:00", portion_g: 40 }],
    ["DELETE", "/feeders/feeder99/schedules/morning-feed", undefined],
  ])("returns 404 for %s on an unknown feeder", async (method, path, body) => {
    const res = await call(method, path, { token: owner, body });
    expect(res.status).toBe(404);
    expect(errorShaped(res.body).code).toBe("not_found");
  });
});
