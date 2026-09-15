import "server-only";
import { isRunning } from "./jobs";
import { getSheet, sourcesSignature } from "./repo";
import type { SheetScope, SheetState } from "./types";

export function sheetState(scope: SheetScope, scopeId: number): SheetState {
  const sheet = getSheet(scope, scopeId) ?? null;
  return {
    sheet,
    // Hand-written sheets have no signature and are never "stale".
    stale: Boolean(sheet?.sources_sig && sheet.sources_sig !== sourcesSignature(scope, scopeId)),
    running: isRunning(scope, scopeId),
  };
}
