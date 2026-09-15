import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, notFound, parseId, readJson, text } from "@/lib/http";
import { sanitizeInk } from "@/lib/ink";
import { deleteNote, getNote, updateNote, updateNoteInk } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

const MAX_NOTE_CHARS = 8_000_000;
const MAX_INK_CHARS = 12_000_000;

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const note = getNote(parseId((await params).id));
  if (!note) throw notFound("Note not found.");
  return Response.json(note);
});

/**
 * Saves a note's text and/or handwriting. `base_updated_at` / `base_ink_updated_at` are the versions
 * the edit started from: if the note changed since (another window or device, or an AI conversion),
 * nothing is saved and the current note comes back with a 409, so newer work is never overwritten.
 */
export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  let note = getNote(id);
  if (!note) throw notFound("Note not found.");
  const body = await readJson(request);

  const patch: { title?: string; content?: string } = {};
  if (body.title !== undefined) patch.title = text(body.title, "Title", { required: false });
  if (body.content !== undefined) {
    if (typeof body.content !== "string") throw badRequest("content must be HTML text.");
    if (body.content.length > MAX_NOTE_CHARS) throw badRequest("This note is too large to save (over 8 MB). Split it into two notes.");
    patch.content = sanitizeRichHtml(body.content);
  }

  const inkPatch: { ink?: string; lineSpacing?: string } = {};
  if (body.ink !== undefined) {
    if (typeof body.ink === "string" && body.ink.length > MAX_INK_CHARS) throw badRequest("There's too much handwriting on this note to save. Continue in a new note.");
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

  const textChange = patch.title !== undefined || patch.content !== undefined;
  const inkChange = inkPatch.ink !== undefined || inkPatch.lineSpacing !== undefined;
  const staleText = textChange && typeof body.base_updated_at === "string" && body.base_updated_at !== note.updated_at;
  const staleInk = inkChange && typeof body.base_ink_updated_at === "string" && body.base_ink_updated_at !== note.ink_updated_at;
  if (staleText || staleInk) {
    return Response.json({ error: "This note was changed somewhere else.", conflict: staleText ? "text" : "ink", note }, { status: 409 });
  }

  if (textChange) note = updateNote(id, patch)!;
  if (inkChange) note = { ...note, ...updateNoteInk(id, inkPatch)! };
  return Response.json({ updated_at: note.updated_at, ink_updated_at: note.ink_updated_at });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteNote(parseId((await params).id));
  return Response.json({ ok: true });
});
