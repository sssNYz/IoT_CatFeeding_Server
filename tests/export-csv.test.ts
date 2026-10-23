import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, call, connectFeeder, errorShaped, eventually, login } from "./helpers";

// The CSV the paper's analysis notebook reads (spec Section 10): every feeding, times in Thai time.
const COLUMNS =
  "event_id,feeder_id,trigger,schedule_id,command_id,scheduled_at,occurred_at,received_at,target_portion_g," +
  "bowl_before_g,bowl_after_g,dispensed_g,rfid_result,rfid_tag,cat_name,result,image_media_id";

let admin: string;
let owner: string;
let feeder: MqttClient;

beforeAll(async () => {
  admin = await login("ADMIN");
  owner = await login("OWNER");
  feeder = await connectFeeder();
});

afterAll(async () => {
  await feeder.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

async function exportCsv(token: string, query = "") {
  const res = await fetch(`${BASE}/feeders/feeder01/events.csv${query}`, { headers: { authorization: `Bearer ${token}` } });
  return { res, text: await res.text() };
}

/** Rows as objects keyed by the header (no field here contains a comma or quote). */
const rows = (text: string) => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const names = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [names[i], v])));
};

describe("GET /feeders/{id}/events.csv", () => {
  it("gives the admin every feeding as CSV, with the cat's name and Thai times", async () => {
    const eventId = `feeder01-csv-${randomBytes(4).toString("hex")}`;
    await feeder.publishAsync(
      "catfeeder/feeder01/event/feeding",
      JSON.stringify({
        event_id: eventId,
        device_id: "feeder01",
        trigger: "schedule",
        schedule_id: "morning-feed",
        scheduled_at: "2026-09-15T07:00:00+07:00",
        occurred_at: "2026-09-15T07:00:04+07:00",
        target_portion_g: 40,
        bowl_before_g: 12.4,
        bowl_after_g: 50.9,
        rfid: { result: "tag", tag_id: "E200001A" },
        image_expected: false,
        result: "ok",
      }),
      { qos: 1 },
    );
    const found = await eventually(
      () => exportCsv(admin),
      ({ text }) => text.includes(eventId),
    );
    expect(found.res.status).toBe(200);
    expect(found.res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(found.text.split(/\r?\n/)[0]).toBe(COLUMNS);
    const row = rows(found.text).find((r) => r.event_id === eventId);
    expect(row).toMatchObject({
      feeder_id: "feeder01",
      trigger: "schedule",
      schedule_id: "morning-feed",
      command_id: "",
      scheduled_at: "2026-09-15T07:00:00+07:00",
      occurred_at: "2026-09-15T07:00:04+07:00",
      target_portion_g: "40",
      bowl_before_g: "12.4",
      bowl_after_g: "50.9",
      dispensed_g: "38.5",
      rfid_result: "tag",
      rfid_tag: "E200001A",
      cat_name: "Mochi",
      result: "ok",
      image_media_id: "",
    });
    expect(row?.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+07:00$/);
  });

  it("keeps only feedings with from <= occurred_at < to, oldest first", async () => {
    // The seed has feedings at 07:00 and 18:00 on each of the last 10 days.
    const { text } = await exportCsv(admin, "?from=2026-01-01T00:00:00%2B07:00&to=2026-01-01T00:00:00%2B07:00");
    expect(rows(text)).toEqual([]);
    const all = rows((await exportCsv(admin)).text).map((r) => r.occurred_at);
    expect(all).toEqual([...all].sort((a, b) => Date.parse(a) - Date.parse(b)));
    const [from, to] = [all[1], all[3]];
    const window = rows((await exportCsv(admin, `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).text);
    expect(window.map((r) => r.occurred_at)).toEqual(all.filter((t) => Date.parse(t) >= Date.parse(from) && Date.parse(t) < Date.parse(to)));
  });

  it("is for the admin only: the owner gets 403", async () => {
    const { res, text } = await exportCsv(owner);
    expect(res.status).toBe(403);
    expect(errorShaped(JSON.parse(text)).code).toBe("forbidden");
  });

  it("returns 404 for a feeder that does not exist", async () => {
    const res = await fetch(`${BASE}/feeders/nope/events.csv`, { headers: { authorization: `Bearer ${admin}` } });
    expect(res.status).toBe(404);
  });

  it("quotes a cat's name that holds a comma or a quote, so the columns stay in place", async () => {
    const tag = `E2${randomBytes(3).toString("hex").toUpperCase()}`;
    expect((await call("POST", "/cats", { token: owner, body: { name: 'Mo, "chi" Jr', rfid_tag: tag } })).status).toBe(201);
    const eventId = `feeder01-csvq-${randomBytes(4).toString("hex")}`;
    await feeder.publishAsync(
      "catfeeder/feeder01/event/feeding",
      JSON.stringify({
        event_id: eventId,
        device_id: "feeder01",
        trigger: "button",
        occurred_at: "2026-09-16T10:00:00+07:00",
        target_portion_g: 20,
        bowl_before_g: 1,
        bowl_after_g: 21,
        rfid: { result: "tag", tag_id: tag },
        result: "ok",
      }),
      { qos: 1 },
    );
    const { text } = await eventually(() => exportCsv(admin), ({ text }) => text.includes(eventId));
    const line = text.split("\r\n").find((l) => l.startsWith(eventId));
    expect(line).toContain(`,${tag},"Mo, ""chi"" Jr",ok,`);
  });
});
