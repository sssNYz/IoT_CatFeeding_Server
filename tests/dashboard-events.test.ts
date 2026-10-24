import { readFile } from "node:fs/promises";
import type { MqttClient } from "mqtt";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectFeeder, env, eventually, feedingEvent, makeJpeg, newPage, openBrowser, signIn, uploadImage } from "./helpers";

const EVENT_TOPIC = "catfeeder/feeder01/event/feeding";

let browser: Browser;
let feeder: MqttClient;

beforeAll(async () => {
  browser = await openBrowser();
  feeder = await connectFeeder();
});

afterAll(async () => {
  await feeder?.publishAsync("catfeeder/feeder01/status", '{"state":"offline"}', { qos: 1, retain: true });
  await feeder?.endAsync();
  await browser?.close();
});

async function eventsPage() {
  const page = await newPage(browser);
  await signIn(page, "ADMIN", "/events");
  await page.getByRole("table").waitFor({ timeout: 10_000 });
  return page;
}

/** The event rows of the table (not its header), newest first. */
const rows = (page: Awaited<ReturnType<typeof eventsPage>>) => page.getByRole("table").locator("tbody tr");

describe("dashboard events page", () => {
  it("puts a new event from feeder01 on top within about 5 s, with the cat's name and dispensed grams", async () => {
    const page = await eventsPage();
    const event = feedingEvent({ rfid: { result: "tag", tag_id: "E200001A" }, bowl_before_g: 3, bowl_after_g: 22.5 });
    await feeder.publishAsync(EVENT_TOPIC, JSON.stringify(event), { qos: 1 });

    const top = rows(page).first();
    await top.filter({ hasText: "Mochi" }).waitFor({ timeout: 10_000 });
    expect(await top.textContent()).toContain("19.5");
  }, 30_000);

  it("shows only jams when filtered by result jam", async () => {
    const page = await eventsPage();
    await page.getByLabel("Result").selectOption("jam");
    const results = await eventually(
      () => rows(page).locator("td:last-child").allTextContents(),
      (rs) => rs.length > 0 && rs.every((r) => r === "jam"),
      10_000,
    );
    expect(results.length).toBeGreaterThan(0); // the seed has jams
    expect(new Set(results)).toEqual(new Set(["jam"]));
  }, 30_000);

  it("opens a row's raw JSON, and loads the photo thumbnail of an event that has one", async () => {
    const page = await eventsPage();
    const event = feedingEvent({ image_expected: true });
    await feeder.publishAsync(EVENT_TOPIC, JSON.stringify(event), { qos: 1 });
    await uploadImage("feeder01", { token: env("FEEDER01_DEVICE_TOKEN"), eventId: event.event_id, file: makeJpeg() });

    const row = rows(page).filter({ hasText: event.event_id });
    await row.waitFor({ timeout: 10_000 });
    const thumb = row.getByRole("img");
    await thumb.waitFor({ timeout: 10_000 });
    await eventually(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth), (w) => w > 0);
    expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32);

    await row.click();
    const raw = page.getByRole("dialog");
    await raw.waitFor({ timeout: 5_000 });
    expect(JSON.parse((await raw.locator("pre").textContent()) ?? "")).toEqual(event);
  }, 30_000);

  it("downloads the chosen feeder's events.csv", async () => {
    const page = await eventsPage();
    await page.getByLabel("Feeder").selectOption("feeder01");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      page.getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("feeder01-events.csv");
    const csv = await readFile((await download.path())!, "utf8");
    const [header, ...lines] = csv.trim().split("\r\n");
    expect(header.split(",").slice(0, 3)).toEqual(["event_id", "feeder_id", "trigger"]);
    expect(lines.length).toBeGreaterThan(10); // the seed's ~20 feedings and more
    expect(lines.every((l) => l.split(",")[1] === "feeder01")).toBe(true);
  }, 30_000);
});
