import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/api/auth";
import { readBody, route, unauthorized } from "@/lib/api/http";
import { LoginRequest } from "@/lib/contract/schemas";
import { db, schema } from "@/lib/db";

export const POST = route(async (req) => {
  const { email, password } = await readBody(req, LoginRequest);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Same answer for an unknown email and a wrong password.
  if (!row || !(await compare(password, row.passwordHash))) throw unauthorized("Wrong email or password");

  const user = { id: row.id, email: row.email, role: row.role };
  return Response.json({ ...(await signToken(user)), user });
});
