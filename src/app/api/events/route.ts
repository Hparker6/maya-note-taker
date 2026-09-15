import type { NextRequest } from "next/server";
import { createEvent, listEvents, listNotesCreated } from "@/lib/calendar";
import { maybeAutoSync } from "@/lib/canvas";
import { manualEventInput } from "@/lib/event-input";
import { badRequest, handler, readJson } from "@/lib/http";

/** Events in a range, plus the notes and lectures added in it. */
export const GET = handler(async (request: NextRequest) => {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw badRequest("from and to are required.");
  maybeAutoSync();
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  return Response.json({ events: listEvents(fromIso, toIso), notes: listNotesCreated(fromIso, toIso) });
});

export const POST = handler(async (request: Request) => {
  const event = createEvent(manualEventInput(await readJson(request)));
  return Response.json(event, { status: 201 });
});
