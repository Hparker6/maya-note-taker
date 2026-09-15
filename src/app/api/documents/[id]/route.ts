import { handler, notFound, optionalInt, parseId, readJson, text } from "@/lib/http";
import { deleteDocument, getDocument, getUnitContext, updateDocument } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getDocument(id)) throw notFound("PDF not found.");
  const body = await readJson(request);
  const unitId = optionalInt(body.unit_id);
  if (unitId && !getUnitContext(unitId)) throw notFound("Unit not found.");
  updateDocument(id, {
    title: body.title === undefined ? undefined : text(body.title, "Title"),
    unitId,
  });
  return Response.json({ ok: true });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteDocument(parseId((await params).id));
  return Response.json({ ok: true });
});
