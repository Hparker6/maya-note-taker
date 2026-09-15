import { handler, notFound, readJson } from "@/lib/http";
import { buildBundle, createShareLink, lanOrigin, listShareLinks, type ShareLink } from "@/lib/share";
import { shareId, shareInclude, shareScope } from "@/lib/share-input";

const withUrls = (link: ShareLink, request: Request, lan: string | null) => ({
  ...link,
  url: `${new URL(request.url).origin}/s/${link.token}`,
  lan_url: lan ? `${lan}/s/${link.token}` : null,
});

/** GET /api/shares?scope=class&id=1 — links that share this item. */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const scope = shareScope(params.get("scope"));
  const id = shareId(params.get("id"));
  const lan = lanOrigin(request.url);
  return Response.json({ links: listShareLinks(scope, id).map((l) => withUrls(l, request, lan)), lan_origin: lan });
});

/** Creates a read-only link. */
export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const scope = shareScope(body.scope);
  const id = shareId(body.id);
  const include = shareInclude((key) => (body.include as Record<string, unknown> | undefined)?.[key]);
  if (!buildBundle(scope, id, include)) throw notFound("That item no longer exists.");
  return Response.json(withUrls(createShareLink(scope, id, include), request, lanOrigin(request.url)), { status: 201 });
});
