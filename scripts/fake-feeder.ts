// Plays a feeder over MQTT so the owner app sees a live feeder without hardware (tickets 04, 05).
// Speaks exactly the spec Section 5 payloads, so the ESP32 firmware can copy this behaviour.
//   npm run fake-feeder              # feeder01 against the local stack
//   Feeds by itself at each enabled schedule time (Thai time). While it runs, press:
//     f = button feed now   o = outage: send 5 late events from the last hour   d = resend the last event (duplicate)
//   Ctrl+C = clean shutdown (says offline); kill -9 <pid it prints> = power cut (the broker sends the Last Will)
// Runs as one process (node --import tsx, not the tsx CLI, which runs the script in a child process),
// so the printed pid is the one holding the MQTT connection.
import { randomBytes } from "node:crypto";
import mqtt from "mqtt";
import { nowTh, toThai } from "../lib/time";

try {
  process.loadEnvFile(".env");
} catch {
  // Variables may come from the shell instead.
}

const id = process.env.FEEDER_ID ?? "feeder01";
const passwordVar = `${id.toUpperCase()}_MQTT_PASSWORD`;
const password = process.env[passwordVar];
if (!password) throw new Error(`${passwordVar} is not set (see .env.example)`);

const FW = "0.3.0-fake";
const topic = (kind: string) => `catfeeder/${id}/${kind}`;
const OFFLINE = JSON.stringify({ state: "offline" });
let applied: number | undefined;
type Schedule = { schedule_id: string; time: string; portion_g: number; enabled: boolean };
let schedules: Schedule[] = [];
let lastEvent: object | undefined;

const client = mqtt.connect(process.env.MQTT_TEST_URL ?? "mqtt://localhost:1883", {
  username: id, // username = device_id, so the ACL limits it to its own topics
  password,
  clientId: `${id}-fake`,
  clean: true, // spec Section 9 rule 9: no stale commands from an old session
  keepalive: 5, // the broker notices a dead feeder within ~8 s
  will: { topic: topic("status"), payload: Buffer.from(OFFLINE), qos: 1, retain: true },
});

const reportStatus = () =>
  client.publish(
    topic("status"),
    JSON.stringify({ state: "online", ...(applied !== undefined && { schedule_version: applied }), fw: FW }),
    { qos: 1, retain: true },
  );

client.on("connect", () => {
  console.log(`${id}: connected, online (fw ${FW}, pid ${process.pid})`);
  reportStatus();
  client.subscribe([topic("schedule/set"), topic("command/feed")], { qos: 1 });
});

client.on("message", (t, payload) => {
  const msg = JSON.parse(payload.toString());
  if (t === topic("schedule/set")) {
    applied = msg.schedule_version;
    schedules = msg.schedules;
    const list = schedules.map((s) => `${s.time} ${s.portion_g} g${s.enabled ? "" : " (off)"}`);
    console.log(`${id}: applied schedule v${applied}: ${list.join(", ") || "none"}`);
    reportStatus();
  } else if (t === topic("command/feed")) {
    console.log(`${id}: got feed command ${msg.command_id} (${msg.portion_g} g); feeding comes with ticket 06`);
  }
});

// ---------- Feeding ----------

// Who is at the bowl: mostly the seeded cats, sometimes nobody readable, now and then two cats or a stranger.
function readRfid() {
  const r = Math.random();
  if (r < 0.4) return { result: "tag", tag_id: "E200001A" };
  if (r < 0.65) return { result: "tag", tag_id: "E200001B" };
  if (r < 0.85) return { result: "unknown", tag_id: null };
  if (r < 0.95) return { result: "multiple", tag_id: null };
  return { result: "tag", tag_id: "E2FF0042" };
}

const round1 = (g: number) => Math.round(g * 10) / 10;

/** One feeding, as event/feeding JSON. The real board makes event_id itself (and passes it to the camera, ADR 0001). */
function feedingEvent(
  trigger: "schedule" | "remote" | "button",
  portion: number,
  at: { scheduled_at?: string; occurred_at: string; schedule_id?: string; command_id?: string },
) {
  const before = round1(2 + Math.random() * 12);
  return {
    event_id: `${id}-${randomBytes(4).toString("hex")}`,
    device_id: id,
    trigger,
    schedule_id: at.schedule_id ?? null,
    command_id: at.command_id ?? null,
    scheduled_at: at.scheduled_at ?? null,
    occurred_at: at.occurred_at,
    target_portion_g: portion,
    bowl_before_g: before,
    bowl_after_g: round1(before + portion * (0.92 + Math.random() * 0.12)), // within about ±8% of the target
    rfid: readRfid(),
    image_expected: false, // no fake camera yet (ticket 07)
    result: "ok",
    device: { rssi: -55 - Math.floor(Math.random() * 15), fw: FW, queue_len: 0 },
  };
}

function sendEvent(event: ReturnType<typeof feedingEvent>, note = "") {
  lastEvent = event;
  client.publish(topic("event/feeding"), JSON.stringify(event), { qos: 1 });
  const who = event.rfid.tag_id ?? event.rfid.result;
  console.log(`${id}: fed ${event.target_portion_g} g (${event.trigger}, ${who}) ${event.event_id}${note}`);
}

// Check the clock every second and feed once per enabled schedule per day, like the board's own timer.
const fedToday = new Set<string>();
setInterval(() => {
  const now = nowTh(); // "2026-11-02T07:00:00+07:00"
  const [day, hhmm] = [now.slice(0, 10), now.slice(11, 16)];
  for (const s of schedules) {
    const key = `${s.schedule_id}@${day}`;
    if (!s.enabled || s.time !== hhmm || fedToday.has(key)) continue;
    fedToday.add(key);
    const at = { schedule_id: s.schedule_id, scheduled_at: `${day}T${s.time}:00+07:00`, occurred_at: nowTh() };
    sendEvent(feedingEvent("schedule", s.portion_g, at));
  }
}, 1_000).unref();

/** Five button feedings from the last hour, sent now: what a board uploads from its queue after an outage. */
function replayOutage() {
  console.log(`${id}: back from an outage, uploading 5 queued events`);
  for (let i = 5; i >= 1; i--) {
    const occurred = toThai(new Date(Date.now() - i * 12 * 60_000));
    sendEvent(feedingEvent("button", 20, { occurred_at: occurred }), ` (happened ${occurred.slice(11, 16)})`);
  }
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key: string) => {
    if (key === "\u0003") process.emit("SIGINT"); // Ctrl+C arrives as a key in raw mode
    else if (key === "f") sendEvent(feedingEvent("button", 20, { occurred_at: nowTh() }));
    else if (key === "o") replayOutage();
    else if (key === "d" && lastEvent) {
      client.publish(topic("event/feeding"), JSON.stringify(lastEvent), { qos: 1 });
      console.log(`${id}: resent the last event (the server should count a duplicate)`);
    }
  });
  console.log(`${id}: keys: f = button feed, o = outage replay, d = duplicate, Ctrl+C = quit`);
}

client.on("error", (e) => console.error(`${id}: ${e.message}`));
client.on("offline", () => console.log(`${id}: lost the broker, retrying…`));

process.on("SIGINT", () => {
  client.publish(topic("status"), OFFLINE, { qos: 1, retain: true }, () => {
    client.end(false, () => {
      console.log(`${id}: offline, bye`);
      process.exit(0);
    });
  });
});
