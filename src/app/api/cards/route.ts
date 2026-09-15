import { badRequest, handler, notFound, readJson, text } from "@/lib/http";
import { createCard, getCard, MAX_CARD_BACK, MAX_CARD_FRONT } from "@/lib/practice";
import { getUnitContext } from "@/lib/repo";

export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const unitId = Number(body.unit_id);
  if (!Number.isInteger(unitId) || unitId <= 0) throw badRequest("unit_id is required.");
  if (!getUnitContext(unitId)) throw notFound("Unit not found.");
  const front = text(body.front, "Front", { max: MAX_CARD_FRONT });
  const back = text(body.back, "Back", { max: MAX_CARD_BACK });
  const id = createCard({ unitId, front, back, kind: front.includes("___") ? "cloze" : "basic" });
  return Response.json(getCard(id), { status: 201 });
});
