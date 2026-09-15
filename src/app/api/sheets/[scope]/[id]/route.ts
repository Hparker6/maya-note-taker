import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, readJson } from "@/lib/http";
import { isRunning } from "@/lib/jobs";
import { deleteSheet, getSheet, updateSheetContent } from "@/lib/repo";
import { resolveScope, type SheetCtx } from "@/lib/sheet-scope";

/** Save manual edits to a sheet. A `base_updated_at` older than the saved sheet is refused (409), never overwritten. */
export const PUT = handler(async (request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  if (isRunning(scope, id)) throw badRequest("This sheet is being regenerated. Wait for it to finish before editing.");
  const body = await readJson(request);
  if (typeof body.content !== "string") throw badRequest("content must be HTML text.");
  if (body.content.length > 8_000_000) throw badRequest("Sheet is too large.");
  const current = getSheet(scope, id);
  if (current && typeof body.base_updated_at === "string" && body.base_updated_at !== current.updated_at) {
    return Response.json({ error: "This sheet was changed somewhere else.", conflict: "sheet", sheet: current }, { status: 409 });
  }
  const sheet = updateSheetContent(scope, id, sanitizeRichHtml(body.content));
  return Response.json({ updated_at: sheet.updated_at });
});

export const DELETE = handler(async (_request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  deleteSheet(scope, id);
  return Response.json({ ok: true });
});
