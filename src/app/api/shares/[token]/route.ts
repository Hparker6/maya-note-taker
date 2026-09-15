import { handler, notFound } from "@/lib/http";
import { deleteShareLink } from "@/lib/share";

type Ctx = { params: Promise<{ token: string }> };

/** Stops sharing: the link stops working immediately. */
export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  if (!deleteShareLink((await params).token)) throw notFound("Link not found.");
  return Response.json({ ok: true });
});
