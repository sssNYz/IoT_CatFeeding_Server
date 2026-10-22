import { requireUser } from "@/lib/api/auth";
import { route } from "@/lib/api/http";

export const GET = route(async (req) => Response.json(await requireUser(req)));
