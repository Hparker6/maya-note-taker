import { handler } from "@/lib/http";
import { getJob, startJob, subscribe } from "@/lib/jobs";
import { resolveScope, type SheetCtx } from "@/lib/sheet-scope";
import type { JobEvent } from "@/lib/types";

/**
 * Streams sheet generation progress as NDJSON.
 * `{ start: true }` starts (or restarts) generation; otherwise this attaches to a
 * running job, or answers `{ t: "idle" }` when there is none.
 */
export const POST = handler(async (request: Request, ctx: SheetCtx) => {
  const { scope, id } = await resolveScope(ctx);
  const body = (await request.json().catch(() => ({}))) as { start?: boolean };

  let job = getJob(scope, id);
  if (body.start && (!job || job.result)) job = startJob(scope, id);

  const encoder = new TextEncoder();
  const line = (e: JobEvent) => encoder.encode(JSON.stringify(e) + "\n");

  if (!job) {
    return new Response(line({ t: "idle" }), { headers: { "Content-Type": "application/x-ndjson" } });
  }

  const running = job;
  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      unsubscribe = subscribe(running, (event) => {
        if (closed) return;
        try {
          controller.enqueue(line(event));
        } catch {
          closed = true;
        }
        if (event.t === "done" || event.t === "error") {
          closed = true;
          queueMicrotask(() => {
            unsubscribe();
            try {
              controller.close();
            } catch {}
          });
        }
      });
    },
    cancel() {
      // The client left; generation keeps going and saves on its own.
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
