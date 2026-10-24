import { randomBytes } from "node:crypto";
import type { MqttClient } from "mqtt";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminStats, FeederStatus } from "../lib/contract/schemas";
import { DASHBOARD, call, connectFeeder, env, eventually, login, openBrowser, shaped } from "./helpers";

const STATUS_TOPIC = "catfeeder/feeder01/status";

let browser: Browser;
let feeder: MqttClient;

beforeAll(async () => {
  browser = await openBrowser();
  feeder = await connectFeeder();
});

afterAll(async () => {
  // Leave feeder01 offline, as it is with no fake feeder running.
  await feeder?.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
  await feeder?.endAsync();
  await browser?.close();
});

async function feeder01Status() {
  const { body } = await call("GET", "/feeders/feeder01/status", { token: await login("ADMIN") });
  return shaped(FeederStatus, body);
}

async function stats() {
  const { body } = await call("GET", "/admin/stats", { token: await login("ADMIN") });
  return shaped(AdminStats, body);
}

/** The number on one stats tile, read the way the admin sees it. */
const tile = async (page: Page, name: string) =>
  Number(await page.getByRole("region", { name }).getByRole("definition").textContent());

/** A fresh browser tab, on UTC like a laptop abroad, so only the server's +07:00 can make the times Thai. */
async function newPage() {
  const context = await browser.newContext({ timezoneId: "UTC" });
  return context.newPage();
}

async function signIn(page: Page, who: "ADMIN" | "OWNER") {
  await page.goto(DASHBOARD);
  await page.getByLabel("Email").fill(env(`SEED_${who}_EMAIL`));
  await page.getByLabel("Password").fill(env(`SEED_${who}_PASSWORD`));
  await page.getByRole("button", { name: "Sign in" }).click();
}

describe("dashboard overview", () => {
  it("shows the admin a card for each feeder after signing in", async () => {
    const page = await newPage();
    await signIn(page, "ADMIN");
    const card = page.getByRole("article", { name: "Kitchen feeder" });
    await card.waitFor({ timeout: 10_000 });
    expect(await card.textContent()).toContain("feeder01");
    expect(await page.getByRole("article", { name: "Spare feeder" }).count()).toBe(1);
  });

  it("turns an owner away with a clear message", async () => {
    const page = await newPage();
    await signIn(page, "OWNER");
    // Next.js keeps an empty route announcer with role=alert on every page, so look for ours by its words.
    await page.getByRole("alert").filter({ hasText: "admin" }).waitFor({ timeout: 10_000 });
    expect(await page.getByRole("article").count()).toBe(0);
  });

  it("shows feeder01 going online, its firmware and a Thai last-seen time, without a reload", async () => {
    await feeder.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
    const page = await newPage();
    await signIn(page, "ADMIN");
    const card = page.getByRole("article", { name: "Kitchen feeder" });
    await card.getByText("offline").waitFor({ timeout: 10_000 });

    await feeder.publishAsync(STATUS_TOPIC, '{"state":"online","fw":"0.9.9-dash"}', { qos: 1, retain: true });
    await card.getByText("online", { exact: true }).waitFor({ timeout: 10_000 });
    expect(await card.textContent()).toContain("0.9.9-dash");
    // The browser is on UTC; only the server's +07:00 clock time may appear.
    const thaiClock = (await feeder01Status()).last_seen!.slice(11, 16);
    expect(await card.textContent()).toContain(thaiClock);
  }, 30_000);

  it("flips the card to offline after a power cut (Last Will), without a reload", async () => {
    const dropped = await connectFeeder({ keepalive: 1 });
    await dropped.publishAsync(STATUS_TOPIC, '{"state":"online","fw":"0.3.0"}', { qos: 1, retain: true });
    const page = await newPage();
    await signIn(page, "ADMIN");
    const card = page.getByRole("article", { name: "Kitchen feeder" });
    await card.getByText("online", { exact: true }).waitFor({ timeout: 10_000 });

    dropped.stream.destroy(); // no DISCONNECT, so the broker sends the will
    await card.getByText("offline", { exact: true }).waitFor({ timeout: 10_000 });
  }, 30_000);

  it("counts a new event and a resent one on the stats tiles, without a reload", async () => {
    const page = await newPage();
    await signIn(page, "ADMIN");
    const before = await stats();
    await eventually(() => tile(page, "Events stored"), (n) => n === before.events_total);

    const event = JSON.stringify({
      event_id: `feeder01-dash-${randomBytes(4).toString("hex")}`,
      device_id: "feeder01",
      trigger: "button",
      occurred_at: "2026-10-24T09:00:00+07:00",
      target_portion_g: 20,
      bowl_before_g: 2,
      bowl_after_g: 21,
      rfid: { result: "unknown", tag_id: null },
      image_expected: false,
      result: "ok",
      device: { rssi: -58, fw: "0.3.0", queue_len: 0 },
    });
    await feeder.publishAsync("catfeeder/feeder01/event/feeding", event, { qos: 1 });
    const stored = await eventually(() => tile(page, "Events stored"), (n) => n > before.events_total, 10_000);
    expect(stored).toBe(before.events_total + 1);

    await feeder.publishAsync("catfeeder/feeder01/event/feeding", event, { qos: 1 });
    const rejected = await eventually(
      () => tile(page, "Duplicates rejected"),
      (n) => n > before.duplicates_rejected,
      10_000,
    );
    expect(rejected).toBe(before.duplicates_rejected + 1);
    expect(await tile(page, "Events stored")).toBe(before.events_total + 1);
  }, 30_000);

  it("stays signed in across a reload, and signing out returns to the sign-in form", async () => {
    const page = await newPage();
    await signIn(page, "ADMIN");
    const card = page.getByRole("article", { name: "Kitchen feeder" });
    await card.waitFor({ timeout: 10_000 });
    await page.reload();
    await card.waitFor({ timeout: 10_000 });

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 5_000 });
    await page.reload();
    await page.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 5_000 });
    expect(await page.getByRole("article").count()).toBe(0);
  }, 30_000);
});
