import { handler, notFound, parseId } from "@/lib/http";
import { getDocument, getDocumentInternals } from "@/lib/repo";
import { readFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const doc = getDocument(id);
  const internals = getDocumentInternals(id);
  if (!doc || !internals) throw notFound("PDF not found.");

  let bytes: Buffer;
  try {
    bytes = await readFile(internals.stored_name);
  } catch {
    throw notFound("The PDF file is missing from storage.");
  }

  const download = new URL(request.url).searchParams.has("download");
  const filename = doc.original_name.replace(/[^\w.\- ()]+/g, "_") || "document.pdf";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
