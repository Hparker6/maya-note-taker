import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isValidSession, passwordRequired } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (!passwordRequired()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  if (await isValidSession(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
