import { requireUser } from "@/lib/api/auth";
import { feederStatus } from "@/lib/api/feeders";
import { route } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) =>
  Response.json(await feederStatus(await requireUser(req), (await params).id)),
);
