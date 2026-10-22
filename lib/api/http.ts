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

/** A 422 naming one bad field, in the same shape a failed schema check gives. */
export const invalid = (field: string, message: string) =>
  new ApiError(422, "validation_error", `${field}: ${message}`, [{ field, message }]);

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
  return validate(schema, body);
}

/** Parse the query string against a contract schema, the same way. */
export function readQuery<S extends ZodType>(req: Request, schema: S): z.infer<S> {
  const query = Object.fromEntries(new URL(req.url).searchParams);
  // A query string reads "+" as a space, so an unencoded "+07:00" arrives as " 07:00". Say so plainly.
  const unencoded = Object.entries(query).filter(([, v]) => / \d{2}:\d{2}$/.test(v));
  if (unencoded.length > 0) {
    const details = unencoded.map(([field]) => ({ field, message: "Encode + as %2B: send +07:00 as %2B07:00" }));
    throw new ApiError(422, "validation_error", `${details[0].field}: ${details[0].message}`, details);
  }
  return validate(schema, query);
}

function validate<S extends ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join(".") || "body", message: i.message }));
    throw new ApiError(422, "validation_error", `${details[0].field}: ${details[0].message}`, details);
  }
  return parsed.data;
}
