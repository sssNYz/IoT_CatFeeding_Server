import { requireFeederToken } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { openFeederSound } from "@/lib/api/sounds";

type Ctx = { params: Promise<{ id: string; sound_id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { id, sound_id } = await params;
  await requireFeederToken(req, id);
  // A stored sound never changes; the feeder caches it on flash anyway.
  return new Response(await openFeederSound(id, sound_id), {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" },
  });
});
