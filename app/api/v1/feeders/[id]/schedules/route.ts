import { requireUser } from "@/lib/api/auth";
import { readBody, route } from "@/lib/api/http";
import { listSchedules, saveSchedule } from "@/lib/api/schedules";
import { ScheduleInput } from "@/lib/contract/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) =>
  Response.json(await listSchedules(await requireUser(req), (await params).id)),
);

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const input = await readBody(req, ScheduleInput);
  return Response.json(await saveSchedule(user, id, input), { status: 201 });
});
