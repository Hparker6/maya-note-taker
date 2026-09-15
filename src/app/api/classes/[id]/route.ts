import { isClassColor } from "@/lib/colors";
import { badRequest, handler, moveDir, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteClass, getClass, moveClass, updateClass } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getClass(id)) throw notFound("Class not found.");
  const body = await readJson(request);

  const dir = moveDir(body.move);
  if (dir) moveClass(id, dir);

  const patch: { name?: string; code?: string; color?: string } = {};
  if (body.name !== undefined) patch.name = text(body.name, "Class name");
  if (body.code !== undefined) patch.code = text(body.code, "Course code", { max: 40, required: false });
  if (body.color !== undefined) {
    if (!isClassColor(body.color)) throw badRequest("Unknown color.");
    patch.color = body.color;
  }
  if (Object.keys(patch).length) updateClass(id, patch);
  return Response.json({ ok: true });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteClass(parseId((await params).id));
  return Response.json({ ok: true });
});
