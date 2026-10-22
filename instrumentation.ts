// Runs once when the server boots: bring the database schema up to date, seed an empty database,
// make sure the MinIO bucket exists, then start the MQTT bridge.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  const { seedIfEmpty } = await import("./lib/db/seed");
  const { startBridge } = await import("./lib/bridge");
  const { ensureBucket } = await import("./lib/storage");
  await runMigrations();
  await ensureBucket();
  if (await seedIfEmpty()) console.log("Seeded an empty database from .env");
  startBridge();
}
