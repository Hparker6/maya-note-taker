import { aiStatus, saveAiSettings, type AiProvider } from "@/lib/ai-config";
import { badRequest, handler, readJson } from "@/lib/http";
import { verifyAiKey } from "@/lib/llm";

export const GET = handler(async () => Response.json(aiStatus()));

/**
 * Save a key (checked with the provider first), remove one (null), and/or pick the provider.
 * Keys are never sent back — only a masked hint.
 */
export const PUT = handler(async (request: Request) => {
  const body = await readJson(request);
  const key = (field: string) => {
    const v = body[field];
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v !== "string" || v.trim().length > 500 || /\s/.test(v.trim())) throw badRequest("That doesn't look like an API key.");
    return v.trim();
  };
  const geminiKey = key("gemini_key");
  const claudeKey = key("claude_key");
  const provider = body.provider;
  if (provider !== undefined && provider !== null && provider !== "gemini" && provider !== "claude") throw badRequest("Unknown provider.");

  let notice: string | undefined;
  for (const [p, value] of [["gemini", geminiKey], ["claude", claudeKey]] as const) {
    if (!value) continue;
    const check = await verifyAiKey(p, value);
    if (!check.ok) throw badRequest(check.message ?? "That key was rejected.");
    notice = check.message;
  }

  saveAiSettings({
    geminiKey,
    claudeKey,
    // Saving a key makes that provider the active one.
    provider: (provider as AiProvider | null | undefined) ?? (geminiKey ? "gemini" : claudeKey ? "claude" : undefined),
  });
  return Response.json({ ...aiStatus(), notice });
});
