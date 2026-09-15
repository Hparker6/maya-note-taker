import { sanitizeRichHtml } from "@/lib/html";
import { badRequest, handler, readJson } from "@/lib/http";
import { isRunning } from "@/lib/jobs";
import { deleteSheet, updateSheetContent } from "@/lib/repo";
import { resolveScope, type SheetCtx } from "@/lib/sheet-scope";

/** Save manual edits to a sheet. */
export const PUT = handler(async (request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  if (isRunning(scope, id)) throw badRequest("This sheet is being regenerated. Wait for it to finish before editing.");
  const body = await readJson(request);
  if (typeof body.content !== "string") throw badRequest("content must be HTML text.");
  if (body.content.length > 2_000_000) throw badRequest("Sheet is too large.");
  const sheet = updateSheetContent(scope, id, sanitizeRichHtml(body.content));
  return Response.json({ updated_at: sheet.updated_at });
});

export const DELETE = handler(async (_request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  deleteSheet(scope, id);
  return Response.json({ ok: true });
});
