import { requireUser } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { openMedia } from "@/lib/api/media";

type Ctx = { params: Promise<{ media_id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { body, contentType } = await openMedia(user, (await params).media_id);
  // A stored file never changes, so the app may keep it for a day.
  return new Response(body, { headers: { "content-type": contentType, "cache-control": "private, max-age=86400" } });
});
