import { AUTH_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { handler, readJson } from "@/lib/http";

export const POST = handler(async (request: Request) => {
  const password = process.env.APP_PASSWORD;
  if (!password) return Response.json({ ok: true });

  const body = await readJson(request);
  const attempt = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(await sessionToken(attempt), await sessionToken(password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "That password isn't right." }, { status: 401 });
  }

  const cookie = [
    `${AUTH_COOKIE}=${await sessionToken(password)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 180}`,
    ...(process.env.NODE_ENV === "production" && new URL(request.url).protocol === "https:" ? ["Secure"] : []),
  ].join("; ");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
});

export const DELETE = handler(async () => {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
});
