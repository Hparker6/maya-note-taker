import { handler, notFound, parseId, readJson, text } from "@/lib/http";
import { deleteCard, getCard, MAX_CARD_BACK, MAX_CARD_FRONT, resetCard, updateCard } from "@/lib/practice";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!getCard(id)) throw notFound("Card not found.");
  const body = await readJson(request);
  if (body.reset === true) return Response.json(resetCard(id));
  const card = updateCard(id, {
    front: body.front === undefined ? undefined : text(body.front, "Front", { max: MAX_CARD_FRONT }),
    back: body.back === undefined ? undefined : text(body.back, "Back", { max: MAX_CARD_BACK }),
  });
  return Response.json(card);
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!deleteCard(id)) throw notFound("Card not found.");
  return Response.json({ ok: true });
});
