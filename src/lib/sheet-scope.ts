import "server-only";
import { notFound, parseId } from "./http";
import { scopeExists } from "./repo";
import type { SheetScope } from "./types";

export type SheetCtx = { params: Promise<{ scope: string; id: string }> };

export async function resolveScope(ctx: SheetCtx): Promise<{ scope: SheetScope; id: number }> {
  const { scope, id: rawId } = await ctx.params;
  if (scope !== "document" && scope !== "unit" && scope !== "section") throw notFound();
  const id = parseId(rawId);
  if (!scopeExists(scope, id)) throw notFound("Not found.");
  return { scope, id };
}
