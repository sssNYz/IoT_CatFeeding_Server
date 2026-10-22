import { requireAdmin } from "@/lib/api/auth";
import { eventStats } from "@/lib/api/events";
import { route } from "@/lib/api/http";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return Response.json(await eventStats());
});
