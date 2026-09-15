import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteNote, getNote, updateNote } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

const MAX_NOTE_CHARS = 8_000_000;

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getNote(id)) throw notFound("Note not found.");
  const body = await readJson(request);

  const patch: { title?: string; content?: string } = {};
  if (body.title !== undefined) patch.title = text(body.title, "Title", { required: false });
  if (body.content !== undefined) {
    if (typeof body.content !== "string") throw badRequest("content must be HTML text.");
    if (body.content.length > MAX_NOTE_CHARS) throw badRequest("Note is too large.");
    patch.content = sanitizeRichHtml(body.content);
  }
  const note = updateNote(id, patch);
  return Response.json({ updated_at: note!.updated_at });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  deleteNote(parseId((await params).id));
  return Response.json({ ok: true });
});
