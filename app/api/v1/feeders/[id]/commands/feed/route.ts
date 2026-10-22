import { requireUser } from "@/lib/api/auth";
import { feedNow } from "@/lib/api/commands";
import { readBody, route } from "@/lib/api/http";
import { FeedCommandRequest } from "@/lib/contract/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const input = await readBody(req, FeedCommandRequest);
  return Response.json(await feedNow(user, id, input), { status: 202 });
});
