import { requireUser } from "@/lib/api/auth";
import { createCat, listCats } from "@/lib/api/cats";
import { readBody, route } from "@/lib/api/http";
import { CatInput } from "@/lib/contract/schemas";

export const GET = route(async (req) => Response.json({ cats: await listCats(await requireUser(req)) }));

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await readBody(req, CatInput);
  return Response.json(await createCat(user, input), { status: 201 });
});
