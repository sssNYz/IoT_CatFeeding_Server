import { requireFeederToken } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { readImageUpload, saveImage } from "@/lib/api/media";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await requireFeederToken(req, id);
  const { eventId, data } = await readImageUpload(req);
  return Response.json(await saveImage(id, eventId, data), { status: 201 });
});
