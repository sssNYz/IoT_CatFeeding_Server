import { requireUser } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { listSounds, readSoundUpload, saveSound } from "@/lib/api/sounds";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) =>
  Response.json({ sounds: await listSounds(await requireUser(req), (await params).id) }),
);

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const upload = await readSoundUpload(req);
  return Response.json(await saveSound(user, id, upload), { status: 201 });
});
