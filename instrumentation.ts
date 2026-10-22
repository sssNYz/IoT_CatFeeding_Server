// Runs once when the server boots: bring the database schema up to date, seed an empty database,
// then connect to Mosquitto and (re)publish every feeder's schedule set on each connect.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  const { seedIfEmpty } = await import("./lib/db/seed");
  const { mqttClient } = await import("./lib/mqtt");
  const { publishAllSchedules } = await import("./lib/api/schedules");
  await runMigrations();
  if (await seedIfEmpty()) console.log("Seeded an empty database from .env");
  mqttClient().on("connect", () => void publishAllSchedules().catch(console.error));
}
