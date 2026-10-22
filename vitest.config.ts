import { defineConfig } from "vitest/config";

// Tests call the running stack over HTTP (`docker compose up` first), so they check the real server.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 15_000 },
});
