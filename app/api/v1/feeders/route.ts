import { requireUser } from "@/lib/api/auth";
import { listFeeders } from "@/lib/api/feeders";
import { route } from "@/lib/api/http";

export const GET = route(async (req) => Response.json({ feeders: await listFeeders(await requireUser(req)) }));
