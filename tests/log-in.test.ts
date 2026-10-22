import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { Feeder, LoginResponse, User } from "../lib/contract/schemas";
import { z } from "../lib/contract/registry";
import { call, env, errorShaped, login, shaped } from "./helpers";

const FeederList = z.object({ feeders: z.array(Feeder) });

describe("POST /auth/login", () => {
  it("logs in the seeded owner with a 3-day JWT in Thai time", async () => {
    const { status, body } = await call("POST", "/auth/login", {
      body: { email: env("SEED_OWNER_EMAIL"), password: env("SEED_OWNER_PASSWORD") },
    });
    expect(status).toBe(200);
    const res = shaped(LoginResponse, body);
    expect(res.user).toMatchObject({ email: env("SEED_OWNER_EMAIL"), role: "owner" });
    expect(res.expires_at).toMatch(/\+07:00$/);
    const daysAhead = (Date.parse(res.expires_at) - Date.now()) / 86_400_000;
    expect(daysAhead).toBeGreaterThan(2.99);
    expect(daysAhead).toBeLessThanOrEqual(3);
  });

  it("logs in the seeded admin with role admin", async () => {
    const { body } = await call("POST", "/auth/login", {
      body: { email: env("SEED_ADMIN_EMAIL"), password: env("SEED_ADMIN_PASSWORD") },
    });
    expect(shaped(LoginResponse, body).user.role).toBe("admin");
  });

  it("refuses a wrong password with 401", async () => {
    const { status, body } = await call("POST", "/auth/login", {
      body: { email: env("SEED_OWNER_EMAIL"), password: "not-the-password" },
    });
    expect(status).toBe(401);
    expect(errorShaped(body).code).toBe("unauthorized");
  });

  it("refuses an unknown email with the same 401", async () => {
    const { status, body } = await call("POST", "/auth/login", {
      body: { email: "nobody@catfeeder.test", password: "whatever" },
    });
    expect(status).toBe(401);
    expect(errorShaped(body).code).toBe("unauthorized");
  });

  it("returns 422 with details for a malformed body", async () => {
    const { status, body } = await call("POST", "/auth/login", { body: { email: "not-an-email" } });
    expect(status).toBe(422);
    const error = errorShaped(body);
    expect(error.code).toBe("validation_error");
    expect(error.details?.map((d) => d.field).sort()).toEqual(["email", "password"]);
  });

  it("returns 422 for a body that is not JSON", async () => {
    const { status, body } = await call("POST", "/auth/login", { rawBody: "{oops" });
    expect(status).toBe(422);
    expect(errorShaped(body).details?.[0].field).toBe("body");
  });
});

describe("GET /me", () => {
  it("returns the user for a valid token", async () => {
    const { status, body } = await call("GET", "/me", { token: await login("OWNER") });
    expect(status).toBe(200);
    expect(shaped(User, body)).toMatchObject({ email: env("SEED_OWNER_EMAIL"), role: "owner" });
  });

  it("returns 401 without a token", async () => {
    const { status, body } = await call("GET", "/me");
    expect(status).toBe(401);
    expect(errorShaped(body).code).toBe("unauthorized");
  });

  it("returns 401 for an expired token", async () => {
    const { body: me } = await call("GET", "/me", { token: await login("OWNER") });
    const expired = await new SignJWT({ role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject((me as { id: string }).id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 4 * 86_400)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 86_400)
      .sign(new TextEncoder().encode(env("JWT_SECRET")));
    const { status, body } = await call("GET", "/me", { token: expired });
    expect(status).toBe(401);
    expect(errorShaped(body).code).toBe("unauthorized");
  });

  it("returns 401 for a token signed with another secret", async () => {
    const forged = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("not-the-real-secret"));
    expect((await call("GET", "/me", { token: forged })).status).toBe(401);
  });
});

describe("GET /feeders", () => {
  it("gives the owner feeder01, never connected", async () => {
    const owner = await login("OWNER");
    const { body: me } = await call("GET", "/me", { token: owner });
    const { status, body } = await call("GET", "/feeders", { token: owner });
    expect(status).toBe(200);
    const { feeders } = shaped(FeederList, body);
    expect(feeders.map((f) => f.id)).toEqual(["feeder01"]);
    expect(feeders[0].owner_id).toBe((me as { id: string }).id);
    expect(feeders[0].status).toMatchObject({ state: "unknown", last_seen: null, synced: false });
  });

  it("gives the admin every feeder", async () => {
    const { status, body } = await call("GET", "/feeders", { token: await login("ADMIN") });
    expect(status).toBe(200);
    expect(shaped(FeederList, body).feeders.map((f) => f.id)).toContain("feeder01");
  });

  it("returns 401 without a token", async () => {
    expect((await call("GET", "/feeders")).status).toBe(401);
  });
});
