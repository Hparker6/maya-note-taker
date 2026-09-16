import { badRequest, handler, notFound, parseId } from "@/lib/http";
import { getNote, getUnitContext } from "@/lib/repo";
import { sharedNote } from "@/lib/share";
import { exportFileName, renderNoteDocument } from "@/lib/share-render";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Saves a copy of one note.
 * `format=pdf` opens a printable page (the browser's print window offers "Save as PDF"), with the
 * handwriting measured against the text, exactly as on screen. `format=word` downloads a .doc.
 */
export const GET = handler(async (request: Request, { params }: Ctx) => {
  const note = getNote(parseId((await params).id));
  if (!note) throw notFound("Note not found.");
  const ctx = getUnitContext(note.unit_id);
  if (!ctx) throw notFound("Note not found.");

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "word") throw badRequest("format must be pdf or word.");

  const title = note.title.trim() || (note.kind === "import" ? "Lecture notes" : "Untitled note");
  const html = renderNoteDocument({
    title,
    context: `${ctx.klass.name} › ${ctx.section.name} › ${ctx.unit.name}`,
    updatedAt: note.updated_at,
    note: sharedNote(note),
    forWord: format === "word",
  });

  if (format === "pdf") {
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const name = exportFileName(title, "doc");
  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
