import { handler, notFound, parseId } from "@/lib/http";
import { getTask, jobStreamResponse, practiceKey, startPracticeJob } from "@/lib/jobs";
import { getUnitContext } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

/** Generates AI flashcards and quiz questions for a unit, streaming progress as NDJSON. */
export const POST = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getUnitContext(id)) throw notFound("Unit not found.");
  const body = (await request.json().catch(() => ({}))) as { start?: boolean };
  let job = getTask(practiceKey(id));
  if (body.start && (!job || job.result)) job = startPracticeJob(id);
  return jobStreamResponse(job);
});
