import { today } from "@/lib/day";
import { badRequest, handler, readJson } from "@/lib/http";
import { logStudy } from "@/lib/practice";
import type { StudyMode } from "@/lib/types";

const count = (v: unknown, max: number, field: string) => {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > max) throw badRequest(`${field} is invalid.`);
  return n;
};

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0).slice(0, 500) : []);

/** Records a finished (or abandoned) study session and returns the updated streak. */
export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  if (!["review", "cram", "quiz"].includes(body.mode as string)) throw badRequest("mode is invalid.");
  const results = Array.isArray(body.question_results) ? body.question_results : [];
  return Response.json(
    logStudy({
      day: await today(),
      unitId: Number.isInteger(body.unit_id) ? (body.unit_id as number) : null,
      mode: body.mode as StudyMode,
      items: count(body.items, 1000, "items"),
      correct: count(body.correct, 1000, "correct"),
      xp: count(body.xp, 5000, "xp"),
      seconds: count(body.seconds, 86_400, "seconds"),
      missedCardIds: ids(body.missed_card_ids),
      questionResults: results
        .filter((r): r is { id: number; correct: boolean } => Boolean(r) && Number.isInteger(r.id) && typeof r.correct === "boolean")
        .slice(0, 500),
    }),
  );
});
