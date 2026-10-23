import { readFileSync } from "node:fs";
import { connect } from "node:net";
import mqtt, { type MqttClient } from "mqtt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeederStatus } from "../lib/contract/schemas";
import { call, connectFeeder, env, eventually, login, shaped } from "./helpers";

// The way a real feeder reaches the VPS (spec Section 4): its DuckDNS name, MQTT over TLS on 8883, trusting our CA.
const HOST = env("PUBLIC_HOST");
const TLS_URL = `mqtts://${HOST}:8883`;
const STATUS_TOPIC = "catfeeder/feeder01/status";

let owner: string;
let feeder: MqttClient;

beforeAll(async () => {
  owner = await login("OWNER");
  feeder = await connectFeeder({ url: TLS_URL, ca: readFileSync("certs/ca.crt") });
});

afterAll(async () => {
  await feeder.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
  await feeder.endAsync();
});

async function status() {
  const { status, body } = await call("GET", "/feeders/feeder01/status", { token: owner });
  expect(status).toBe(200);
  return shaped(FeederStatus, body);
}

describe("a feeder on the Internet", () => {
  it("comes online over MQTT with TLS on 8883, trusting our CA", async () => {
    await feeder.publishAsync(STATUS_TOPIC, '{"state":"online","fw":"0.3.0-tls"}', { qos: 1, retain: true });
    const s = await eventually(status, (s) => s.state === "online" && s.fw === "0.3.0-tls");
    expect(s).toMatchObject({ state: "online", fw: "0.3.0-tls" });
  });

  it("is refused by a client that does not trust our CA, so a fake broker cannot pass as ours", async () => {
    const attempt = mqtt.connectAsync(TLS_URL, { username: "feeder01", password: env("FEEDER01_MQTT_PASSWORD"), reconnectPeriod: 0 });
    await expect(attempt).rejects.toThrow(/self[- ]signed|unable to (get|verify)/i);
  });

  it("refuses a wrong password over TLS", async () => {
    const attempt = mqtt.connectAsync(TLS_URL, {
      username: "feeder01",
      password: "wrong",
      ca: readFileSync("certs/ca.crt"),
      reconnectPeriod: 0,
    });
    await expect(attempt).rejects.toThrow(/Not authorized|Bad username or password/);
  });
});

describe("the API on the Internet", () => {
  it("answers over HTTPS on the DuckDNS name with a publicly trusted certificate", async () => {
    // Node's default trust store only: a phone app rejects anything else.
    const res = await fetch(`https://${HOST}/api/v1/me`);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthorized");
  });
});

/** Resolves true if a TCP connection to host:port opens, false if it is refused or times out. */
const opens = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host, port, timeout: 2_000 });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });

describe("what the Internet can reach", () => {
  // Spec Section 4: only 443 (and 80 for the certificate) plus 8883. The rest stays on localhost or the Docker network.
  it.each([
    ["the app without HTTPS", 3000],
    ["MQTT without TLS", 1883],
    ["PostgreSQL", 5432],
    ["MinIO", 9000],
  ])("does not reach %s (port %i)", async (_, port) => {
    expect(await opens(HOST, port)).toBe(false);
  });

  it.each([
    ["HTTPS", 443],
    ["MQTT with TLS", 8883],
  ])("reaches %s (port %i)", async (_, port) => {
    expect(await opens(HOST, port)).toBe(true);
  });
});
