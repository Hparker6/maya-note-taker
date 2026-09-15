import { handler, moveDir, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteUnit, getSheet, getUnitContext, listNotes, moveUnit, renameUnit } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** What there is to study in a unit (used by calendar events that cover it). */
export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const ctx = getUnitContext(id);
  if (!ctx) throw notFound("Unit not found.");
  return Response.json({
    unit: ctx.unit,
    section: ctx.section,
    klass: ctx.klass,
    notes: listNotes(id).map((n) => ({ id: n.id, title: n.title || "Untitled note", kind: n.kind, updated_at: n.updated_at })),
    has_sheet: Boolean(getSheet("unit", id)),
    section_has_sheet: Boolean(getSheet("section", ctx.section.id)),
  });
});

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
