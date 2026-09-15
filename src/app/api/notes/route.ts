import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, notFound, optionalInt, readJson, text } from "@/lib/http";
import { createNote, getDocument, getUnitContext } from "@/lib/repo";

const MAX_NOTE_CHARS = 8_000_000;

export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const documentId = optionalInt(body.document_id) ?? null;
  let unitId = optionalInt(body.unit_id);

  if (documentId) {
    const doc = getDocument(documentId);
    if (!doc) throw notFound("PDF not found.");
    unitId = doc.unit_id;
  }
  if (!unitId || !getUnitContext(unitId)) throw notFound("Unit not found.");

  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > MAX_NOTE_CHARS) throw badRequest("Note is too large.");

  const note = createNote({
    unitId,
    documentId,
    title: text(body.title, "Title", { required: false }),
    content: sanitizeRichHtml(content),
  });
  return Response.json(note, { status: 201 });
});
