// Optional password gate. Uses Web Crypto so it runs in the proxy and in route handlers.

export const AUTH_COOKIE = "notebook_session";

export function passwordRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("notebook-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  if (!cookie) return false;
  return safeEqual(cookie, await sessionToken(password));
}
