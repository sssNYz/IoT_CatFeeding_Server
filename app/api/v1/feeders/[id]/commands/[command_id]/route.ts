import { requireUser } from "@/lib/api/auth";
import { getCommand } from "@/lib/api/commands";
import { route } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string; command_id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id, command_id } = await params;
  return Response.json(await getCommand(user, id, command_id));
});
