import type { ZodType, z } from "zod";
import type { ErrorResponse } from "../contract/schemas";

type ErrorBody = z.infer<typeof ErrorResponse>["error"];

/** Thrown inside a route; `route()` turns it into the contract Error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorBody["code"],
    message: string,
    readonly details?: ErrorBody["details"],
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Token missing or expired") => new ApiError(401, "unauthorized", message);

/** Wrap a Route Handler so every thrown ApiError becomes `{ error: { code, message, details? } }`. */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      const { status, code, message, details } = e;
      return Response.json({ error: { code, message, ...(details && { details }) } }, { status });
    }
  };
}

/** Parse a JSON body against a contract schema; anything wrong is a 422 naming the field. */
export async function readBody<S extends ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(422, "validation_error", "Body must be JSON", [{ field: "body", message: "Invalid JSON" }]);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join(".") || "body", message: i.message }));
    throw new ApiError(422, "validation_error", `${details[0].field}: ${details[0].message}`, details);
  }
  return parsed.data;
}
