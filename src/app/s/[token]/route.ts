import { buildBundle, countShareView, getShareLink } from "@/lib/share";
import { attachment } from "@/lib/share-input";
import { renderShareHtml, shareFileName } from "@/lib/share-render";

type Ctx = { params: Promise<{ token: string }> };

const notFound = () =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link not available</title><body style="font:16px system-ui;background:#f6f4ef;color:#1d1b17;display:grid;place-items:center;min-height:90vh;margin:0"><div style="text-align:center;padding:24px"><h1 style="font-family:Georgia,serif">This link isn't available</h1><p style="color:#8a847a">It may have been turned off by the person who shared it.</p></div>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

/** A read-only page for classmates. Public by design: whoever has the link can view it. */
export async function GET(request: Request, { params }: Ctx) {
  const { token } = await params;
  const link = getShareLink(token);
  const bundle = link && buildBundle(link.scope, link.scope_id, link.include);
  if (!link || !bundle) return notFound();
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (!download) countShareView(token);
  return new Response(renderShareHtml(bundle, download ? {} : { downloadUrl: `/s/${token}?download=1` }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...(download ? { "Content-Disposition": attachment(shareFileName(bundle)) } : {}),
    },
  });
}
