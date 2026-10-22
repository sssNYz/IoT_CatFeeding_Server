// Plays a feeder over MQTT so the owner app sees a live feeder without hardware (ticket 04).
// Speaks exactly the spec Section 5 payloads, so the ESP32 firmware can copy this behaviour.
//   npm run fake-feeder              # feeder01 against the local stack
//   Ctrl+C = clean shutdown (says offline); kill -9 <pid it prints> = power cut (the broker sends the Last Will)
// Runs as one process (node --import tsx, not the tsx CLI, which runs the script in a child process),
// so the printed pid is the one holding the MQTT connection.
import mqtt from "mqtt";

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
    const list = msg.schedules.map((s: { time: string; portion_g: number; enabled: boolean }) =>
      `${s.time} ${s.portion_g} g${s.enabled ? "" : " (off)"}`,
    );
    console.log(`${id}: applied schedule v${applied}: ${list.join(", ") || "none"}`);
    reportStatus();
  } else if (t === topic("command/feed")) {
    console.log(`${id}: got feed command ${msg.command_id} (${msg.portion_g} g); feeding comes with ticket 06`);
  }
});

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
