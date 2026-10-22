import { requireUser } from "@/lib/api/auth";
import { route } from "@/lib/api/http";
import { mediaResponse } from "@/lib/api/media";

type Ctx = { params: Promise<{ media_id: string }> };

export const GET = route<Ctx>(async (req, { params }) => mediaResponse(await requireUser(req), (await params).media_id));
