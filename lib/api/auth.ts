import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db, schema } from "../db";
import { toThai } from "../time";
import { ApiError, unauthorized } from "./http";

// JWT lasts 3 days (spec Section 8).
const TOKEN_LIFETIME_S = 3 * 24 * 60 * 60;

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set (see .env.example)");
  return new TextEncoder().encode(value);
};

export type AuthUser = { id: string; email: string; role: "owner" | "admin" };

export async function signToken(user: AuthUser) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_S;
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret());
  return { token, expires_at: toThai(new Date(exp * 1000)) };
}

/** The user behind `Authorization: Bearer <JWT>`, or a 401. Reads the DB so a deleted user is refused. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw unauthorized();
  let sub: string | undefined;
  try {
    ({ payload: { sub } } = await jwtVerify(token, secret(), { algorithms: ["HS256"] }));
  } catch {
    throw unauthorized();
  }
  if (!sub) throw unauthorized();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, sub));
  if (!user) throw unauthorized();
  return user;
}

/** The user, who must be the admin (spec Section 8: admin-only actions), or a 401/403. */
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new ApiError(403, "forbidden", "Admins only");
  return user;
}

// Device tokens are long random strings, so a plain SHA-256 is enough; only the hash is stored (spec Section 8).
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A device route's caller (the feeder's ESP32 boards) must hold this feeder's device token (`Authorization: Bearer <token>`), or a 401. */
export async function requireFeederToken(req: Request, feederId: string) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw unauthorized("Device token missing");
  const [feeder] = await db
    .select({ hash: schema.feeders.deviceTokenHash })
    .from(schema.feeders)
    .where(eq(schema.feeders.id, feederId));
  const given = Buffer.from(tokenHash(token), "hex");
  const stored = feeder?.hash ? Buffer.from(feeder.hash, "hex") : undefined;
  if (!stored || !timingSafeEqual(given, stored)) throw unauthorized("Wrong device token");
}
