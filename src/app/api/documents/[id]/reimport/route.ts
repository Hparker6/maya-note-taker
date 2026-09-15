import { handler, notFound, parseId } from "@/lib/http";
import { importExtracted } from "@/lib/imports";
import { extractPdf } from "@/lib/pdf";
import { getDocumentInternals, getImportNote } from "@/lib/repo";
import { readFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** Rebuilds a lecture's editable note from its PDF with the built-in (free) formatter. Replaces edits. */
export const POST = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const internals = getDocumentInternals(id);
  if (!internals) throw notFound("PDF not found.");
  const extracted = await extractPdf(new Uint8Array(await readFile(internals.stored_name)));
  // A PDF without a text layer has nothing to rebuild from: keep the current notes (e.g. an AI conversion).
  if (!extracted.scanned) importExtracted(id, extracted);
  return Response.json({ note: getImportNote(id), scanned: extracted.scanned });
});
