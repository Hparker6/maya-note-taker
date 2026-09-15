import { handler, moveDir, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteUnit, getUnitContext, moveUnit, renameUnit } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getUnitContext(id)) throw notFound("Unit not found.");
  const body = await readJson(request);
  const dir = moveDir(body.move);
  if (dir) moveUnit(id, dir);
  if (body.name !== undefined) renameUnit(id, text(body.name, "Unit name"));
  return Response.json({ ok: true });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteUnit(parseId((await params).id));
  return Response.json({ ok: true });
});
