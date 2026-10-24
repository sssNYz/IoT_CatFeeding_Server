import { readFileSync } from "node:fs";
import { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";
import { Sound } from "../lib/contract/schemas";
import { BASE, call, env, errorShaped, login, makeWav, shaped, uploadSound } from "./helpers";

const SoundList = z.object({ sounds: z.array(Sound) });

let owner: string;

/** Sample rate and channels from the first MP3 frame header (after any ID3 tag), read straight from the bytes. */
function mp3Format(bytes: Buffer) {
  let at = 0;
  if (bytes.subarray(0, 3).toString() === "ID3") {
    at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  while (at < bytes.length - 4 && !(bytes[at] === 0xff && (bytes[at + 1] & 0xe0) === 0xe0)) at++;
  const version = (bytes[at + 1] >> 3) & 0b11; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const rates = { 3: [44_100, 48_000, 32_000], 2: [22_050, 24_000, 16_000], 0: [11_025, 12_000, 8_000] }[version];
  return {
    sampleRate: rates?.[(bytes[at + 2] >> 2) & 0b11],
    mono: (bytes[at + 3] >> 6) === 0b11,
  };
}

const deviceGet = (path: string, token: string) =>
  fetch(`${BASE}/devices/feeder01/sounds/${path}`, { headers: { authorization: `Bearer ${token}` } });

beforeAll(async () => {
  owner = await login("OWNER");
});

describe("POST /feeders/{id}/sounds", () => {
  it("turns an uploaded WAV into a Sound with its length, listed for the feeder", async () => {
    const res = await uploadSound("feeder01", { token: owner, name: "Mochi dinner call", file: makeWav(2) });
    expect(res.status).toBe(201);
    const sound = shaped(Sound, res.body);
    expect(sound.name).toBe("Mochi dinner call");
    expect(sound.duration_s).toBeCloseTo(2, 0);
    expect(sound.created_at).toMatch(/\+07:00$/);

    const list = await call("GET", "/feeders/feeder01/sounds", { token: owner });
    expect(list.status).toBe(200);
    expect(shaped(SoundList, list.body).sounds).toContainEqual(sound);
  });

  it("converts a phone's m4a (index at the end of the file) too", async () => {
    // tests/fixtures/call.m4a: 1.5 s AAC stereo 44.1 kHz, made with ffmpeg, which puts moov after mdat like phones do.
    const file = readFileSync("tests/fixtures/call.m4a");
    const res = await uploadSound("feeder01", { token: owner, name: "Phone call", file, type: "audio/mp4", filename: "call.m4a" });
    expect(res.status).toBe(201);
    expect(shaped(Sound, res.body).duration_s).toBeCloseTo(1.5, 0);
  });
});

describe("POST /feeders/{id}/sounds refuses", () => {
  it.each([
    ["a file that is not audio", { name: "x", file: Buffer.from("just some text, not a recording".repeat(50)) }, "file"],
    ["a recording over 2 MB", { name: "x", file: makeWav(13) }, "file"],
    ["no name", { file: makeWav(1) }, "name"],
  ])("%s with 422", async (_, opts, field) => {
    const res = await uploadSound("feeder01", { token: owner, ...opts });
    expect(res.status).toBe(422);
    expect(errorShaped(res.body).details?.map((d) => d.field)).toEqual([field]);
  });

  it("an owner's upload to a feeder that is not theirs with 403", async () => {
    const res = await uploadSound("feeder02", { token: owner, name: "x", file: makeWav(1) });
    expect(res.status).toBe(403);
  });
});

describe("GET /devices/{id}/sounds/{sound_id}", () => {
  it("gives the feeder its sound as a mono MP3 at 16 kHz or lower", async () => {
    const sound = shaped(Sound, (await uploadSound("feeder01", { token: owner, name: "Tora", file: makeWav(1) })).body);
    const res = await deviceGet(sound.sound_id, env("FEEDER01_DEVICE_TOKEN"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const format = mp3Format(Buffer.from(await res.arrayBuffer()));
    expect(format.mono).toBe(true);
    expect(format.sampleRate).toBeLessThanOrEqual(16_000);
    expect(format.sampleRate).toBeGreaterThanOrEqual(8_000);
  });

  it("refuses a wrong device token with 401 and an unknown sound_id with 404", async () => {
    const sound = shaped(Sound, (await uploadSound("feeder01", { token: owner, name: "Tora", file: makeWav(1) })).body);
    const wrong = await deviceGet(sound.sound_id, env("FEEDER02_DEVICE_TOKEN"));
    expect(wrong.status).toBe(401);
    expect(errorShaped(await wrong.json()).code).toBe("unauthorized");

    const unknown = await deviceGet("snd-00000000", env("FEEDER01_DEVICE_TOKEN"));
    expect(unknown.status).toBe(404);
    expect(errorShaped(await unknown.json()).code).toBe("not_found");
  });
});

describe("GET /media/{media_id} for a sound", () => {
  it("lets the owner app play the converted MP3", async () => {
    const sound = shaped(Sound, (await uploadSound("feeder01", { token: owner, name: "Play me", file: makeWav(1) })).body);
    const res = await fetch(`${BASE}/media/${sound.media_id}`, { headers: { authorization: `Bearer ${owner}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(mp3Format(Buffer.from(await res.arrayBuffer())).mono).toBe(true);
  });
});
