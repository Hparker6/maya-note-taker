import { handler, moveDir, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteSection, getSection, moveSection, renameSection } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getSection(id)) throw notFound("Section not found.");
  const body = await readJson(request);
  const dir = moveDir(body.move);
  if (dir) moveSection(id, dir);
  if (body.name !== undefined) renameSection(id, text(body.name, "Section name"));
  return Response.json({ ok: true });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteSection(parseId((await params).id));
  return Response.json({ ok: true });
});
