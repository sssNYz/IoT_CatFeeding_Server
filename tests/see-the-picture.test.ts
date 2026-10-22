import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventList, ImageSaved } from "../lib/contract/schemas";
import { BASE, call, connectFeeder, env, errorShaped, eventually, login, makeJpeg, shaped, uploadImage } from "./helpers";

let owner: string;
let feeder: MqttClient;

beforeAll(async () => {
  owner = await login("OWNER");
  feeder = await connectFeeder();
});

afterAll(async () => {
  await feeder.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

/** The main board's feeding event for this event_id (dated in the past, below real history). */
const sendEvent = (eventId: string) =>
  feeder.publishAsync(
    "catfeeder/feeder01/event/feeding",
    JSON.stringify({
      event_id: eventId,
      device_id: "feeder01",
      trigger: "button",
      occurred_at: "2026-10-01T09:00:00+07:00",
      target_portion_g: 20,
      bowl_before_g: 3,
      bowl_after_g: 22,
      rfid: { result: "tag", tag_id: "E200001B" },
      image_expected: true,
      result: "ok",
    }),
    { qos: 1 },
  );

const eventInHistory = (eventId: string, done: (e?: { image_media_id: string | null }) => boolean) =>
  eventually(async () => {
    const { body } = await call("GET", "/feeders/feeder01/events?limit=200", { token: owner });
    return shaped(EventList, body).events.find((e) => e.event_id === eventId);
  }, done);

const upload = async (eventId: string) =>
  shaped(ImageSaved, (await uploadImage("feeder01", { token: env("FEEDER01_DEVICE_TOKEN"), eventId, file: makeJpeg() })).body);

const newEventId = () => `feeder01-${randomBytes(4).toString("hex")}`;

describe("POST /devices/{id}/images", () => {
  it("stores a JPEG sent with the feeder's device token", async () => {
    const eventId = newEventId();
    const { status, body } = await uploadImage("feeder01", { token: env("FEEDER01_DEVICE_TOKEN"), eventId, file: makeJpeg() });
    expect(status).toBe(201);
    expect(shaped(ImageSaved, body).event_id).toBe(eventId);
  });

  it.each([
    ["no token", undefined],
    ["a wrong token", "not-the-token"],
    ["another feeder's token", "FEEDER02"],
  ])("refuses an upload with %s with 401", async (_, token) => {
    const real = token === "FEEDER02" ? env("FEEDER02_DEVICE_TOKEN") : token;
    const res = await uploadImage("feeder01", { token: real, eventId: newEventId(), file: makeJpeg() });
    expect(res.status).toBe(401);
    expect(errorShaped(res.body).code).toBe("unauthorized");
  });
});

describe("refused uploads", () => {
  const token = () => env("FEEDER01_DEVICE_TOKEN");
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"); // PNG signature, sent as image/jpeg
  const tooBig = Buffer.concat([makeJpeg(), Buffer.alloc(1024 * 1024)]); // starts like a JPEG, just over 1 MB

  it.each([
    ["file", "a PNG labelled image/jpeg", { file: png }],
    ["file", "a text file", { file: Buffer.from("hello"), type: "text/plain" }],
    ["file", "a file over 1 MB", { file: tooBig }],
    ["file", "no file", {}],
    ["event_id", "no event_id", { file: makeJpeg(), eventId: undefined }],
    ["event_id", "an event_id that would leave its folder", { file: makeJpeg(), eventId: "../feeder02/x" }],
  ])("returns 422 naming %s for %s", async (field, _, opts) => {
    const res = await uploadImage("feeder01", { token: token(), eventId: newEventId(), ...opts });
    expect(res.status).toBe(422);
    const error = errorShaped(res.body);
    expect(error.code).toBe("validation_error");
    expect(error.details?.map((d) => d.field)).toEqual([field]);
  });
});

describe("linking a photo to its feeding", () => {
  it("fills image_media_id when the photo arrives after the event", async () => {
    const eventId = newEventId();
    await sendEvent(eventId);
    expect((await eventInHistory(eventId, Boolean))?.image_media_id).toBeNull();
    const { media_id } = await upload(eventId);
    expect((await eventInHistory(eventId, (e) => !!e?.image_media_id))?.image_media_id).toBe(media_id);
  });

  it("fills image_media_id when the photo arrives first, as after an outage", async () => {
    const eventId = newEventId();
    const { media_id } = await upload(eventId);
    await sendEvent(eventId);
    expect((await eventInHistory(eventId, Boolean))?.image_media_id).toBe(media_id);
  });
});

describe("GET /media/{media_id}", () => {
  const getMedia = (mediaId: string, token?: string) =>
    fetch(`${BASE}/media/${mediaId}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  it("streams the exact JPEG to the feeder's owner, and to the admin", async () => {
    const photo = makeJpeg([30, 160, 90]);
    const saved = await uploadImage("feeder01", { token: env("FEEDER01_DEVICE_TOKEN"), eventId: newEventId(), file: photo });
    const { media_id } = shaped(ImageSaved, saved.body);
    for (const token of [owner, await login("ADMIN")]) {
      const res = await getMedia(media_id, token);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(Buffer.from(await res.arrayBuffer()).equals(photo)).toBe(true);
    }
  });

  it("returns 403 to an owner for another feeder's photo", async () => {
    const eventId = `feeder02-${newEventId().slice(9)}`;
    const saved = await uploadImage("feeder02", { token: env("FEEDER02_DEVICE_TOKEN"), eventId, file: makeJpeg() });
    const res = await getMedia(shaped(ImageSaved, saved.body).media_id, owner);
    expect(res.status).toBe(403);
    expect(errorShaped(await res.json()).code).toBe("forbidden");
  });

  it.each([
    ["an unknown id", "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f"],
    ["an id that is not a UUID", "nope"],
  ])("returns 404 for %s", async (_, mediaId) => {
    const res = await getMedia(mediaId, owner);
    expect(res.status).toBe(404);
    expect(errorShaped(await res.json()).code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    expect((await getMedia("6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f")).status).toBe(401);
  });
});
