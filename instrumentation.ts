// Runs once when the server boots: bring the database schema up to date, seed an empty database,
// then start the MQTT bridge.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  const { seedIfEmpty } = await import("./lib/db/seed");
  const { startBridge } = await import("./lib/bridge");
  await runMigrations();
  if (await seedIfEmpty()) console.log("Seeded an empty database from .env");
  startBridge();
}
