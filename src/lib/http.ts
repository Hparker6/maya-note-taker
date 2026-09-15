import "server-only";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const badRequest = (message: string) => new HttpError(400, message);

/** Wraps a route handler so thrown HttpErrors become JSON error responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response> | Response) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(err);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw badRequest("Expected a JSON object.");
}

/** Trimmed, length-limited string field. */
export function text(value: unknown, field: string, opts: { max?: number; required?: boolean } = {}): string {
  const { max = 200, required = true } = opts;
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required.`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw badRequest(`${field} can't be empty.`);
  if (trimmed.length > max) throw badRequest(`${field} is too long.`);
  return trimmed;
}

export function optionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest("Invalid id.");
  return n;
}

export function moveDir(value: unknown): "up" | "down" | undefined {
  if (value === undefined) return undefined;
  if (value === "up" || value === "down") return value;
  throw badRequest("move must be up or down.");
}
