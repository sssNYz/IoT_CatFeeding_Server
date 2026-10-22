import type { ZodType, z } from "zod";
import mqtt from "mqtt";
import { expect } from "vitest";
import { ErrorResponse } from "../lib/contract/schemas";

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
