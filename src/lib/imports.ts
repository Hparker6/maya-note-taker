import "server-only";
import { extractPdf } from "./pdf";
import { listDocumentsWithoutImport, setImportContent } from "./repo";
import { readFile } from "./storage";

/** Turns a PDF's extracted structure into its editable note. */
export function importExtracted(documentId: number, extracted: { html: string; scanned: boolean }) {
  return setImportContent(documentId, extracted.scanned ? "" : extracted.html, extracted.scanned ? "" : "local");
}

/** Makes sure every PDF (e.g. ones uploaded before notes and PDFs were unified) has an editable note. */
export async function ensureImports(unitId?: number) {
  for (const doc of listDocumentsWithoutImport(unitId)) {
    try {
      importExtracted(doc.id, await extractPdf(new Uint8Array(await readFile(doc.stored_name))));
    } catch (err) {
      console.warn(`[import] could not convert "${doc.title}":`, err);
      setImportContent(doc.id, "", "");
    }
  }
}
