import { handler, notFound } from "@/lib/http";
import { buildBundle } from "@/lib/share";
import { attachment, shareId, shareInclude, shareScope } from "@/lib/share-input";
import { renderShareHtml, shareFileName } from "@/lib/share-render";

/** GET /api/share/export?scope=class&id=1[&lectures=0…] — a share file to send to classmates. */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const bundle = buildBundle(shareScope(params.get("scope")), shareId(params.get("id")), shareInclude((key) => params.get(key)));
  if (!bundle) throw notFound("That item no longer exists.");
  return new Response(renderShareHtml(bundle), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": attachment(shareFileName(bundle)), "Cache-Control": "no-store" },
  });
});
