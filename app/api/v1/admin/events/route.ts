import { requireAdmin } from "@/lib/api/auth";
import { listAdminEvents } from "@/lib/api/events";
import { readQuery, route } from "@/lib/api/http";
import { AdminEventsQuery } from "@/lib/contract/schemas";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return Response.json({ events: await listAdminEvents(readQuery(req, AdminEventsQuery)) });
});
