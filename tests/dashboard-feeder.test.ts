import type { MqttClient } from "mqtt";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectFeeder, eventually, feedingEvent, newPage, openBrowser, signIn } from "./helpers";

const STATUS_TOPIC = "catfeeder/feeder01/status";
const SCHEDULE_TOPIC = "catfeeder/feeder01/schedule/set";
const COMMAND_TOPIC = "catfeeder/feeder01/command/feed";

type ScheduleSet = { schedule_version: number; schedules: { schedule_id: string; time: string; portion_g: number; enabled: boolean }[] };

type Command = { command_id: string; portion_g: number; issued_at: string };

let browser: Browser;
let feeder: MqttClient;
const sets: ScheduleSet[] = [];
const commands: Command[] = [];

beforeAll(async () => {
  browser = await openBrowser();
  feeder = await connectFeeder();
  feeder.on("message", (topic, payload) => {
    if (topic === SCHEDULE_TOPIC) sets.push(JSON.parse(payload.toString()));
    if (topic === COMMAND_TOPIC) commands.push(JSON.parse(payload.toString()));
  });
  await feeder.subscribeAsync([SCHEDULE_TOPIC, COMMAND_TOPIC], { qos: 1 });
});

afterAll(async () => {
  await feeder?.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
  await feeder?.endAsync();
  await browser?.close();
});

async function feederPage() {
  const page = await newPage(browser);
  await signIn(page, "ADMIN", "/feeders/feeder01");
  await page.getByRole("heading", { name: "Kitchen feeder" }).waitFor({ timeout: 10_000 });
  return page;
}

/** The first schedule set the feeder got over MQTT after `act` that `done` accepts. */
async function setAfter(act: () => Promise<void>, done: (s: ScheduleSet) => boolean): Promise<ScheduleSet> {
  const from = sets.length;
  await act();
  const hit = await eventually(async () => sets.slice(from).find(done), Boolean, 10_000);
  expect(hit).toBeDefined();
  return hit!;
}

/** A time no other run has used (between 00:00 and 04:59), so leftovers from earlier runs never match. */
const freshTime = () => {
  const minutes = Math.floor(Math.random() * 300);
  return `0${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
};

async function addSchedule(page: Page, time: string, portion: number) {
  const form = page.getByRole("form", { name: "Add schedule" });
  await form.getByLabel("Time").fill(time);
  await form.getByLabel("Portion (g)").fill(String(portion));
  await form.getByRole("button", { name: "Add" }).click();
}

/** Report, as the feeder does, that it now runs `version`. */
const reportApplied = (version: number) =>
  feeder.publishAsync(STATUS_TOPIC, JSON.stringify({ state: "online", fw: "0.3.0", schedule_version: version }), {
    qos: 1,
    retain: true,
  });

const syncState = (page: Page) => page.getByRole("status", { name: "Schedule sync" });

describe("dashboard feeder page", () => {
  it("adds a schedule that reaches the feeder, and shows Waiting until the feeder reports it, then Synced", async () => {
    const page = await feederPage();
    const time = freshTime();
    const set = await setAfter(
      () => addSchedule(page, time, 25),
      (s) => s.schedules.some((x) => x.time === time && x.portion_g === 25),
    );
    await page.getByRole("row").filter({ hasText: time }).waitFor({ timeout: 10_000 });
    await syncState(page).filter({ hasText: "Waiting for feeder…" }).waitFor({ timeout: 10_000 });

    await reportApplied(set.schedule_version);
    await syncState(page).filter({ hasText: "Synced" }).waitFor({ timeout: 10_000 });
  }, 30_000);

  it("edits, disables and deletes a schedule, and the feeder gets each new set", async () => {
    const page = await feederPage();
    const time = freshTime();
    const added = await setAfter(
      () => addSchedule(page, time, 30),
      (s) => s.schedules.some((x) => x.time === time),
    );
    const id = added.schedules.find((x) => x.time === time)!.schedule_id;
    const row = page.getByRole("row").filter({ hasText: id });

    const edited = await setAfter(
      async () => {
        await row.getByRole("button", { name: "Edit" }).click();
        await row.getByLabel("Portion (g)").fill("35");
        await row.getByRole("button", { name: "Save" }).click();
      },
      (s) => s.schedules.some((x) => x.schedule_id === id && x.portion_g === 35),
    );
    expect(edited.schedule_version).toBeGreaterThan(added.schedule_version);

    await setAfter(
      () => row.getByRole("button", { name: "Disable" }).click(),
      (s) => s.schedules.some((x) => x.schedule_id === id && !x.enabled),
    );

    const deleted = await setAfter(
      () => row.getByRole("button", { name: "Delete" }).click(),
      (s) => !s.schedules.some((x) => x.schedule_id === id),
    );
    expect(deleted.schedule_version).toBeGreaterThan(edited.schedule_version);
    await row.waitFor({ state: "detached", timeout: 10_000 });
  }, 45_000);

  it("Feed now shows Feeding… until the feeder's remote event arrives, then Done", async () => {
    const page = await feederPage();
    const from = commands.length;
    const feed = page.getByRole("form", { name: "Feed now" });
    await feed.getByLabel("Portion (g)").fill("15");
    await feed.getByRole("button", { name: "Feed now" }).click();

    const outcome = page.getByRole("status", { name: "Feed now result" });
    await outcome.filter({ hasText: "Feeding…" }).waitFor({ timeout: 10_000 });
    const cmd = await eventually(async () => commands.slice(from)[0], Boolean, 10_000);
    expect(cmd?.portion_g).toBe(15);

    const event = feedingEvent({ trigger: "remote", command_id: cmd!.command_id, target_portion_g: 15, bowl_after_g: 17 });
    await feeder.publishAsync("catfeeder/feeder01/event/feeding", JSON.stringify(event), { qos: 1 });
    await outcome.filter({ hasText: "Done" }).waitFor({ timeout: 10_000 });
  }, 30_000);

  it("Feed now ends with 'Feeder did not respond' when no event comes back within about 60 s", async () => {
    await feeder.publishAsync(STATUS_TOPIC, '{"state":"offline"}', { qos: 1, retain: true });
    const page = await feederPage();
    const feed = page.getByRole("form", { name: "Feed now" });
    await feed.getByRole("button", { name: "Feed now" }).click();

    const outcome = page.getByRole("status", { name: "Feed now result" });
    await outcome.filter({ hasText: "Feeding…" }).waitFor({ timeout: 10_000 });
    const started = Date.now();
    await outcome.filter({ hasText: "Feeder did not respond" }).waitFor({ timeout: 75_000 });
    expect(Date.now() - started).toBeGreaterThan(50_000);
  }, 100_000);
});
