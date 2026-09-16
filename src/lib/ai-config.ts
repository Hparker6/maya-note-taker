import "server-only";
import { getSetting, setSetting } from "./db";
import type { AiProvider, AiStatus } from "./types";

export type { AiProvider, AiStatus } from "./types";

const GEMINI_KEY = "ai.gemini_key";
const CLAUDE_KEY = "ai.anthropic_key";
const PROVIDER = "ai.provider";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
/** Tried in order when the main model is overloaded or out of free requests (each model has its own free quota). */
export const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
export const CLAUDE_MODEL = "claude-opus-5";

/** First non-blank value: a key that is blank (or stray whitespace in .env) counts as "not set". */
const firstKey = (...values: (string | null | undefined)[]) => values.map((v) => v?.trim()).find(Boolean) ?? null;

const geminiEnvKey = () => firstKey(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
const claudeEnvKey = () => firstKey(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_AUTH_TOKEN);

/** Keys pasted in the app win over environment variables. */
export function geminiKey() {
  return firstKey(getSetting(GEMINI_KEY)) ?? geminiEnvKey();
}

export function claudeKey() {
  return firstKey(getSetting(CLAUDE_KEY)) ?? claudeEnvKey();
}

/** The provider to use: the one chosen in settings if it has a key, else Gemini (free tier), else Claude. */
export function activeProvider(): AiProvider | null {
  const chosen = getSetting(PROVIDER);
  if (chosen === "gemini" && geminiKey()) return "gemini";
  if (chosen === "claude" && claudeKey()) return "claude";
  if (geminiKey()) return "gemini";
  if (claudeKey()) return "claude";
  return null;
}

export function aiConfigured() {
  return activeProvider() !== null;
}

const hint = (value: string | null) => (value ? `••••${value.slice(-4)}` : null);

export function aiStatus(): AiStatus {
  return {
    provider: activeProvider(),
    geminiKeyHint: hint(geminiKey()),
    claudeKeyHint: hint(claudeKey()),
    geminiFromEnv: !firstKey(getSetting(GEMINI_KEY)) && Boolean(geminiEnvKey()),
    claudeFromEnv: !firstKey(getSetting(CLAUDE_KEY)) && Boolean(claudeEnvKey()),
    geminiModel: GEMINI_MODEL,
    claudeModel: CLAUDE_MODEL,
  };
}

export function saveAiSettings(input: { geminiKey?: string | null; claudeKey?: string | null; provider?: AiProvider | null }) {
  if (input.geminiKey !== undefined) setSetting(GEMINI_KEY, input.geminiKey?.trim() || null);
  if (input.claudeKey !== undefined) setSetting(CLAUDE_KEY, input.claudeKey?.trim() || null);
  if (input.provider !== undefined) setSetting(PROVIDER, input.provider);
}
