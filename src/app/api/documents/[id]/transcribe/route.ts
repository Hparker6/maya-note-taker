import { handler, notFound, parseId } from "@/lib/http";
import { getTask, jobStreamResponse, startTranscriptJob, transcriptKey } from "@/lib/jobs";
import { getDocument } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Converts a PDF into its editable note with Claude, streaming progress as NDJSON. */
export const POST = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getDocument(id)) throw notFound("PDF not found.");
  const body = (await request.json().catch(() => ({}))) as { start?: boolean };
  let job = getTask(transcriptKey(id));
  if (body.start && (!job || job.result)) job = startTranscriptJob(id);
  return jobStreamResponse(job);
});
