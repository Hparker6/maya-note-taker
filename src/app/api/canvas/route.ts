import { CanvasError, canvasStatus, disconnectCanvas, saveCanvasSettings, syncCanvas } from "@/lib/canvas";
import { badRequest, handler, readJson } from "@/lib/http";

export const GET = handler(async () => Response.json(canvasStatus()));

/** Save the calendar feed link and/or API credentials, then sync. */
export const PUT = handler(async (request: Request) => {
  const body = await readJson(request);
  const field = (key: string) => {
    const v = body[key];
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v !== "string" || v.length > 2000) throw badRequest(`${key} is invalid.`);
    return v;
  };
  try {
    saveCanvasSettings({ feedUrl: field("feed_url"), apiUrl: field("api_url"), token: field("token") });
  } catch (err) {
    if (err instanceof CanvasError) throw badRequest(err.message);
    throw err;
  }
  const lastSync = await syncCanvas();
  return Response.json({ ...canvasStatus(), lastSync });
});

export const DELETE = handler(async () => {
  disconnectCanvas();
  return Response.json(canvasStatus());
});
