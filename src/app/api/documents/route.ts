import { aiConfigured } from "@/lib/ai";
import { badRequest, handler, notFound, optionalInt } from "@/lib/http";
import { startJob } from "@/lib/jobs";
import { extractPdf, isPdf } from "@/lib/pdf";
import { createDocument, getUnitContext } from "@/lib/repo";
import { deleteStoredFile, saveFile } from "@/lib/storage";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function titleFromFilename(name: string) {
  return (
    name
      .replace(/\.pdf$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled PDF"
  ).slice(0, 200);
}

export const POST = handler(async (request: Request) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Expected a file upload.");
  }

  const unitId = optionalInt(form.get("unit_id"));
  if (!unitId || !getUnitContext(unitId)) throw notFound("Unit not found.");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw badRequest("Choose at least one PDF.");

  const created: { id: number; title: string }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: "larger than 100 MB" });
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(bytes)) {
      rejected.push({ name: file.name, reason: "not a PDF" });
      continue;
    }

    let extracted = { pageCount: 0, text: "" };
    try {
      extracted = await extractPdf(bytes);
    } catch (err) {
      // Encrypted or malformed PDFs still upload; they just aren't searchable.
      console.warn(`[upload] text extraction failed for ${file.name}:`, err);
    }

    const storedName = await saveFile(bytes);
    try {
      const title = titleFromFilename(file.name);
      const id = createDocument({
        unitId,
        title,
        originalName: file.name.slice(0, 255),
        storedName,
        size: file.size,
        pageCount: extracted.pageCount,
        text: extracted.text,
      });
      created.push({ id, title });
    } catch (err) {
      deleteStoredFile(storedName);
      throw err;
    }
  }

  if (form.get("condense") === "1" && aiConfigured()) {
    for (const doc of created) startJob("document", doc.id);
  }

  return Response.json({ created, rejected }, { status: created.length ? 201 : 400 });
});
