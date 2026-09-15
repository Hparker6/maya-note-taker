import type { NextRequest } from "next/server";
import { handler } from "@/lib/http";
import { search } from "@/lib/repo";

export const GET = handler(async (request: NextRequest) => {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  return Response.json({ hits: search(q) });
});
