import { requireUser } from "@/lib/api/auth";
import { listEvents } from "@/lib/api/events";
import { readQuery, route } from "@/lib/api/http";
import { EventsQuery } from "@/lib/contract/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const query = readQuery(req, EventsQuery);
  return Response.json({ events: await listEvents(user, id, query) });
});
