import { handler } from "@/lib/http";
import { getTask, jobStreamResponse, sheetKey, startSheetJob } from "@/lib/jobs";
import { resolveScope, type SheetCtx } from "@/lib/sheet-scope";

/**
 * Streams sheet generation progress as NDJSON.
 * `{ start: true }` starts (or restarts) generation; otherwise this attaches to a
 * running job, or answers `{ t: "idle" }` when there is none.
 */
export const POST = handler(async (request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  const body = (await request.json().catch(() => ({}))) as { start?: boolean };
  let job = getTask(sheetKey(scope, id));
  if (body.start && (!job || job.result)) job = startSheetJob(scope, id);
  return jobStreamResponse(job);
});
