import mqtt, { type IClientPublishOptions, type MqttClient } from "mqtt";

// How long a route waits for the broker's PUBACK before answering anyway. The message stays queued in the client.
const PUBLISH_WAIT_MS = 5_000;

// One client per server process, shared by every route bundle (Next.js keeps module state per bundle, not per process).
const globalForMqtt = globalThis as unknown as { mqttClient?: MqttClient };

/** The app's MQTT login (`backend` in the ACL, spec Section 5). Connects on first use and reconnects by itself. */
export function mqttClient() {
  return (globalForMqtt.mqttClient ??= connect());
}

function connect() {
  const password = process.env.MQTT_BACKEND_PASSWORD;
  if (!password) throw new Error("MQTT_BACKEND_PASSWORD is not set (see .env.example)");
  const client = mqtt.connect(process.env.MQTT_URL ?? "mqtt://mosquitto:1883", {
    username: "backend",
    password,
    clientId: `catfeeder-app-${process.pid}`,
    reconnectPeriod: 2_000,
  });
  client.on("error", (e) => console.error("MQTT:", e.message));
  return client;
}

/** Publish at QoS 1. Resolves false if the broker has not acknowledged it within a few seconds. */
export async function publish(topic: string, payload: unknown, opts: Omit<IClientPublishOptions, "qos"> = {}) {
  const sent = mqttClient()
    .publishAsync(topic, JSON.stringify(payload), { ...opts, qos: 1 })
    .then(() => true);
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), PUBLISH_WAIT_MS).unref());
  return Promise.race([sent, timeout]);
}

/** For scripts: disconnect without waiting for messages the broker never acknowledged (publish() already waited). */
export const closeMqtt = async () => {
  await globalForMqtt.mqttClient?.endAsync(true);
  globalForMqtt.mqttClient = undefined;
};
