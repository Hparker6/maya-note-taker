import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, notFound, parseId, readJson, text } from "@/lib/http";
import { sanitizeInk } from "@/lib/ink";
import { deleteNote, getNote, updateNote, updateNoteInk } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

const MAX_NOTE_CHARS = 8_000_000;
const MAX_INK_CHARS = 12_000_000;

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  let note = getNote(id);
  if (!note) throw notFound("Note not found.");
  const body = await readJson(request);

  const patch: { title?: string; content?: string } = {};
  if (body.title !== undefined) patch.title = text(body.title, "Title", { required: false });
  if (body.content !== undefined) {
    if (typeof body.content !== "string") throw badRequest("content must be HTML text.");
    if (body.content.length > MAX_NOTE_CHARS) throw badRequest("Note is too large.");
    patch.content = sanitizeRichHtml(body.content);
  }

  const inkPatch: { ink?: string; lineSpacing?: string } = {};
  if (body.ink !== undefined) {
    if (typeof body.ink === "string" && body.ink.length > MAX_INK_CHARS) throw badRequest("Too much ink on one note.");
    try {
      inkPatch.ink = sanitizeInk(body.ink);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Invalid ink.");
    }
  }
  if (body.line_spacing !== undefined) {
    if (body.line_spacing !== "" && body.line_spacing !== "roomy") throw badRequest("line_spacing must be \"\" or \"roomy\".");
    inkPatch.lineSpacing = body.line_spacing;
  }

  if (patch.title !== undefined || patch.content !== undefined) note = updateNote(id, patch)!;
  if (inkPatch.ink !== undefined || inkPatch.lineSpacing !== undefined) note = { ...note, ...updateNoteInk(id, inkPatch)! };
  return Response.json({ updated_at: note.updated_at });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteNote(parseId((await params).id));
  return Response.json({ ok: true });
});
