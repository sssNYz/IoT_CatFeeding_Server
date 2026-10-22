import { requireUser } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { deleteSchedule } from "@/lib/api/schedules";

type Ctx = { params: Promise<{ id: string; schedule_id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, schedule_id } = await params;
  return Response.json(await deleteSchedule(user, id, schedule_id));
});
