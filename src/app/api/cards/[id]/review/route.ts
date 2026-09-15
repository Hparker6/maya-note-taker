import { today } from "@/lib/day";
import { badRequest, handler, notFound, parseId, readJson } from "@/lib/http";
import { reviewCard } from "@/lib/practice";
import { RATINGS, type Rating } from "@/lib/practice-shared";

type Ctx = { params: Promise<{ id: string }> };

/** Records how well the student remembered a card and schedules its next review. */
export const POST = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  const { rating, key } = await readJson(request);
  if (!RATINGS.includes(rating as Rating)) throw badRequest("rating must be again, hard, good or easy.");
  const reviewKey = typeof key === "string" && /^[\w-]{8,64}$/.test(key) ? key : "";
  const card = reviewCard(id, rating as Rating, await today(), reviewKey);
  if (!card) throw notFound("Card not found.");
  return Response.json(card);
});
