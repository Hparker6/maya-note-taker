import { today } from "@/lib/day";
import { handler, notFound, parseId } from "@/lib/http";
import { isTaskRunning, practiceKey } from "@/lib/jobs";
import { addCardsFromNotes, listCards, listQuestions, listWeakSpots, unitStats } from "@/lib/practice";
import { getUnitContext } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

async function overview(unitId: number) {
  return {
    stats: unitStats(unitId, await today()),
    cards: listCards(unitId),
    questions: listQuestions(unitId),
    weak: listWeakSpots({ unitId }),
    generating: isTaskRunning(practiceKey(unitId)),
  };
}

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getUnitContext(id)) throw notFound("Unit not found.");
  return Response.json(await overview(id));
});

/** Makes flashcards from the unit's notes and sheets — no AI involved. */
export const POST = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getUnitContext(id)) throw notFound("Unit not found.");
  const result = addCardsFromNotes(id);
  return Response.json({ ...result, ...(await overview(id)) });
});
