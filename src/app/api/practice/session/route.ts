import { today } from "@/lib/day";
import { badRequest, handler } from "@/lib/http";
import { buildSession } from "@/lib/practice";
import type { StudyMode } from "@/lib/types";

const MODES: StudyMode[] = ["review", "cram", "quiz", "weak"];

/** GET /api/practice/session?mode=review|cram|quiz|weak[&unit=ID|&class=ID] */
export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") as StudyMode;
  if (!MODES.includes(mode)) throw badRequest("mode must be review, cram, quiz or weak.");
  const id = (name: string) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw badRequest(`${name} is invalid.`);
    return n;
  };
  return Response.json(buildSession(mode, { unitId: id("unit"), classId: id("class") }, await today()));
});
