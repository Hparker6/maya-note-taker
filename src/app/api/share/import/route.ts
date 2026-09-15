import { badRequest, handler } from "@/lib/http";
import { importBundle, parseShareFile, ShareImportError } from "@/lib/share";

const MAX_BYTES = 60 * 1024 * 1024;

/** Adds a classmate's shared notebook file as a new class. */
export const POST = handler(async (request: Request) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a shared notes file.");
  if (file.size > MAX_BYTES) throw badRequest("That file is too large.");
  try {
    const result = importBundle(parseShareFile(await file.text()));
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ShareImportError) throw badRequest(err.message);
    throw err;
  }
});
