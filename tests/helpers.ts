import { randomBytes } from "node:crypto";
import type { Browser, Page } from "playwright";
import type { ZodType, z } from "zod";
import jpeg from "jpeg-js";
import mqtt from "mqtt";
import { expect } from "vitest";
import { ErrorResponse } from "../lib/contract/schemas";
import { nowTh } from "../lib/time";

try {
  process.loadEnvFile(".env");
} catch {
  // Variables may come from the shell instead.
}

export const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; copy .env.example to .env`);
  return value;
};

export const BASE = process.env.API_BASE_URL ?? "http://localhost:3000/api/v1";

export async function call(method: string, path: string, opts: { token?: string; body?: unknown; rawBody?: string } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(opts.token && { authorization: `Bearer ${opts.token}` }),
      ...((opts.body !== undefined || opts.rawBody !== undefined) && { "content-type": "application/json" }),
    },
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

/** Assert the body matches a contract schema exactly (same shape the mock returns). */
export function shaped<S extends ZodType>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  expect(parsed.error?.issues ?? []).toEqual([]);
  return parsed.data as z.infer<S>;
}

export const errorShaped = (body: unknown) => shaped(ErrorResponse, body).error;

export async function login(who: "OWNER" | "ADMIN") {
  const { status, body } = await call("POST", "/auth/login", {
    body: { email: env(`SEED_${who}_EMAIL`), password: env(`SEED_${who}_PASSWORD`) },
  });
  expect(status).toBe(200);
  return (body as { token: string }).token;
}

/** The retained message on a topic right now, read with the app's MQTT login (stack must be up). */
export async function retained(topic: string): Promise<unknown> {
  const client = await mqtt.connectAsync(process.env.MQTT_TEST_URL ?? "mqtt://localhost:1883", {
    username: "backend",
    password: env("MQTT_BACKEND_PASSWORD"),
  });
  try {
    const message = new Promise<unknown>((resolve, reject) => {
      client.on("message", (t, payload, packet) => {
        if (t === topic && packet.retain) resolve(JSON.parse(payload.toString()));
      });
      setTimeout(() => reject(new Error(`No retained message on ${topic}`)), 3_000).unref();
    });
    await client.subscribeAsync(topic, { qos: 1 });
    return await message;
  } finally {
    await client.endAsync();
  }
}

/** Poll until `done` holds (the bridge works asynchronously), then return the last value. */
export async function eventually<T>(get: () => Promise<T>, done: (value: T) => boolean, ms = 5_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await get();
    if (done(value) || Date.now() > until) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Play feeder01 over MQTT with its own login and a Last Will, as the real board does (spec Section 5). */
export function connectFeeder(opts: { keepalive?: number; url?: string; ca?: Buffer } = {}) {
  return mqtt.connectAsync(opts.url ?? process.env.MQTT_TEST_URL ?? "mqtt://localhost:1883", {
    ...(opts.ca && { ca: opts.ca }),
    username: "feeder01",
    password: env("FEEDER01_MQTT_PASSWORD"),
    keepalive: opts.keepalive ?? 60,
    reconnectPeriod: 0,
    will: { topic: "catfeeder/feeder01/status", payload: Buffer.from('{"state":"offline"}'), qos: 1, retain: true },
  });
}

/** A small real JPEG (solid colour), like the ESP32-CAM sends. */
export function makeJpeg(rgb: [number, number, number] = [200, 120, 60], size = 32) {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 80).data);
}

/** POST /devices/{id}/images as multipart form data, the way the camera uploads. */
export async function uploadImage(
  feederId: string,
  opts: { token?: string; eventId?: string; file?: Buffer; type?: string },
) {
  const form = new FormData();
  if (opts.eventId !== undefined) form.set("event_id", opts.eventId);
  if (opts.file) form.set("file", new Blob([new Uint8Array(opts.file)], { type: opts.type ?? "image/jpeg" }), "photo.jpg");
  const res = await fetch(`${BASE}/devices/${feederId}/images`, {
    method: "POST",
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    body: form,
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

/** A real headless Chromium, the way the admin opens the dashboard (`npx playwright install --only-shell chromium`). */
export async function openBrowser() {
  const { chromium } = await import("playwright");
  return chromium.launch();
}

export const DASHBOARD = process.env.DASHBOARD_URL ?? `https://${process.env.PUBLIC_HOST}/admin`;

/** A fresh browser tab, on UTC like a laptop abroad, so only the server's +07:00 can make the times Thai. */
export async function newPage(browser: Browser) {
  const context = await browser.newContext({ timezoneId: "UTC", acceptDownloads: true });
  return context.newPage();
}

/** Open a dashboard page (`path` under /admin) and sign in through its form. */
export async function signIn(page: Page, who: "ADMIN" | "OWNER", path = "") {
  await page.goto(DASHBOARD + path);
  await page.getByLabel("Email").fill(env(`SEED_${who}_EMAIL`));
  await page.getByLabel("Password").fill(env(`SEED_${who}_PASSWORD`));
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A feeding event payload from feeder01, as the main ESP32 publishes it (spec Section 5). */
export function feedingEvent(fields: Record<string, unknown> = {}) {
  return {
    event_id: `feeder01-ui-${randomBytes(4).toString("hex")}`,
    device_id: "feeder01",
    trigger: "button",
    occurred_at: nowTh(),
    target_portion_g: 20,
    bowl_before_g: 2,
    bowl_after_g: 21.5,
    rfid: { result: "unknown", tag_id: null },
    image_expected: false,
    result: "ok",
    device: { rssi: -58, fw: "0.3.0", queue_len: 0 },
    ...fields,
  };
}
