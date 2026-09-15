import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPdf {
  pageCount: number;
  text: string;
}

/** Page count + plain text (used for search, and as a fallback prompt input). */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  // pdf.js may transfer the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return {
      pageCount: totalPages,
      text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    };
  } finally {
    await pdf.cleanup();
  }
}

export function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}
