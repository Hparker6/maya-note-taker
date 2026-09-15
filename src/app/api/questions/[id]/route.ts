import { handler, notFound, parseId } from "@/lib/http";
import { deleteQuestion } from "@/lib/practice";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  const id = parseId((await params).id);
  if (!deleteQuestion(id)) throw notFound("Question not found.");
  return Response.json({ ok: true });
});
