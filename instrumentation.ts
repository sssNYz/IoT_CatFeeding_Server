// Runs once when the server boots: bring the database schema up to date, then seed an empty database.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./lib/db/migrate");
  const { seedIfEmpty } = await import("./lib/db/seed");
  await runMigrations();
  if (await seedIfEmpty()) console.log("Seeded an empty database from .env");
}
