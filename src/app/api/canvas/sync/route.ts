import { canvasConfigured, canvasStatus, syncCanvas } from "@/lib/canvas";
import { badRequest, handler } from "@/lib/http";

export const POST = handler(async () => {
  if (!canvasConfigured()) throw badRequest("Connect Canvas first.");
  await syncCanvas();
  return Response.json(canvasStatus());
});
