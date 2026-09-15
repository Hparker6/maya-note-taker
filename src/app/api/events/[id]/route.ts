import { deleteEvent, getEvent, updateEventPersonal, updateManualEvent } from "@/lib/calendar";
import { classAndUnit, eventKind, manualEventInput } from "@/lib/event-input";
import { badRequest, handler, notFound, parseId, readJson } from "@/lib/http";
import { getUnitContext } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Manual events: send `full: true` with every field to replace them.
 * Any event (including Canvas ones): kind, class_id, unit_id, my_notes and done can be patched.
 */
export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const event = getEvent(id);
  if (!event) throw notFound("Event not found.");
  const body = await readJson(request);

  if (body.full) {
    if (event.source !== "manual") throw badRequest("Events from Canvas can't be rescheduled here.");
    return Response.json(updateManualEvent(id, manualEventInput(body)));
  }

  const patch: Parameters<typeof updateEventPersonal>[1] = {};
  if (body.kind !== undefined) patch.kind = eventKind(body.kind);
  if (body.class_id !== undefined || body.unit_id !== undefined) {
    const classId = body.class_id !== undefined ? body.class_id : event.class_id;
    let unitId = body.unit_id !== undefined ? body.unit_id : event.unit_id;
    // Changing the class drops a unit that belongs to the old class.
    if (body.class_id !== undefined && body.unit_id === undefined && unitId && getUnitContext(Number(unitId))?.klass.id !== classId) unitId = null;
    const links = classAndUnit({ class_id: classId, unit_id: unitId });
    if (body.class_id !== undefined) patch.class_id = links.class_id;
    patch.unit_id = links.unit_id;
  }
  if (body.my_notes !== undefined) {
    if (typeof body.my_notes !== "string" || body.my_notes.length > 50_000) throw badRequest("Notes are too long.");
    patch.my_notes = body.my_notes;
  }
  if (body.done !== undefined) patch.done = Boolean(body.done);
  return Response.json(updateEventPersonal(id, patch));
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const event = getEvent(id);
  if (!event) throw notFound("Event not found.");
  if (event.source !== "manual") throw badRequest("Events from Canvas can't be deleted — mark them done instead.");
  deleteEvent(id);
  return Response.json({ ok: true });
});
