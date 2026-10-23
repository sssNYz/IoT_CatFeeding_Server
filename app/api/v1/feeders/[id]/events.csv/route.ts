import { requireAdmin } from "@/lib/api/auth";
import { exportEventsCsv } from "@/lib/api/events";
import { readQuery, route } from "@/lib/api/http";
import { EventsQuery } from "@/lib/contract/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireAdmin(req);
  const { id } = await params;
  const query = readQuery(req, EventsQuery.pick({ from: true, to: true }));
  return new Response(await exportEventsCsv(user, id, query), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${id}-events.csv"`,
    },
  });
});
