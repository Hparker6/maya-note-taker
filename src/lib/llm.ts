import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI } from "@google/genai";
import { activeProvider, CLAUDE_MODEL, claudeKey, GEMINI_FALLBACK_MODELS, GEMINI_MODEL, geminiKey, type AiProvider } from "./ai-config";
import type { JobStatus } from "./types";

/** A problem the student can fix; its message is shown in the UI as-is. */
export class UserFacingError extends Error {}

/** Provider-neutral prompt pieces. */
export type LlmPart =
  | { type: "text"; text: string }
  | { type: "pdf"; title: string; base64: string }
  | { type: "document_text"; title: string; text: string };

export interface StreamCallbacks {
  status: (s: JobStatus) => void;
  delta: (text: string) => void;
}

export type JsonSchema = Record<string, unknown>;

function requireProvider(): AiProvider {
  const provider = activeProvider();
  if (!provider) throw new UserFacingError("Add a free Gemini API key (or a Claude key) in AI settings to use AI features.");
  return provider;
}

// ───────────────────────────── Claude ─────────────────────────────

function claudeClient(apiKey = claudeKey()) {
  return new Anthropic({ apiKey: apiKey ?? undefined });
}

function claudeContent(parts: LlmPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = parts.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : p.type === "pdf"
        ? { type: "document", title: p.title, source: { type: "base64", media_type: "application/pdf", data: p.base64 } }
        : { type: "document", title: p.title, source: { type: "text", media_type: "text/plain", data: p.text } },
  );
  // Cache the (large, stable) documents so regenerating soon after is cheap.
  const lastDoc = blocks.findLast((b) => b.type === "document");
  if (lastDoc && lastDoc.type === "document") lastDoc.cache_control = { type: "ephemeral" };
  return blocks;
}

async function claudeStream(system: string, parts: LlmPart[], cb: StreamCallbacks, format?: JsonSchema) {
  const stream = claudeClient().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content: claudeContent(parts) }],
    thinking: { type: "adaptive" },
    ...(format ? { output_config: { format: { type: "json_schema" as const, schema: format } } } : {}),
    // If a safety classifier declines, Anthropic re-runs the request on its recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  for await (const event of stream) {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "thinking") cb.status("thinking");
      else if (event.content_block.type === "text") cb.status("writing");
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      cb.delta(event.delta.text);
    }
  }
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new UserFacingError("Claude declined to process this material.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text, truncated: message.stop_reason === "max_tokens" };
}

function claudeError(err: unknown): string | null {
  if (err instanceof Anthropic.AuthenticationError) return "Claude rejected the API key. Check it in AI settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This Claude API key doesn't have access to the model.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limiting requests. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `Claude couldn't process this: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "unknown"}). Try again shortly.`;
  return null;
}

// ───────────────────────────── Gemini ─────────────────────────────

function geminiClient(apiKey = geminiKey()) {
  return new GoogleGenAI({
    apiKey: apiKey ?? undefined,
    ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
  });
}

function geminiInput(parts: LlmPart[]) {
  return parts.flatMap((p) =>
    p.type === "text"
      ? [{ type: "text" as const, text: p.text }]
      : p.type === "pdf"
        ? [
            { type: "text" as const, text: `Document: "${p.title}"` },
            { type: "document" as const, data: p.base64, mime_type: "application/pdf" },
          ]
        : [{ type: "text" as const, text: `<document title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</document>` }],
  );
}

/** Gemini's schema support is a JSON Schema subset; drop keywords it doesn't need. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([k]) => k !== "additionalProperties")
      .map(([k, v]) => [k, geminiSchema(v)]),
  );
}

/** A Gemini failure worth retrying: the model is overloaded, or a free-tier limit was hit. */
class GeminiLimit extends Error {
  constructor(
    message: string,
    public kind: "busy" | "rate" | "daily",
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

function classifyGemini(message: string, status?: number): GeminiLimit | null {
  if (status === 429 || /quota|rate.?limit|resource.?exhausted|too many requests/i.test(message)) {
    const seconds = /retry in ([\d.]+)\s*s/i.exec(message)?.[1];
    const daily = /per.?day|daily/i.test(message);
    return new GeminiLimit(message, daily ? "daily" : "rate", seconds ? Number(seconds) * 1000 : undefined);
  }
  if ((status !== undefined && status >= 500) || /high demand|overloaded|unavailable|try again later/i.test(message)) return new GeminiLimit(message, "busy");
  return null;
}

// Models that recently hit a limit are skipped until this time (per process).
declare global {
  var __mayaGeminiCooldown: Map<string, number> | undefined;
}
const cooldown = (globalThis.__mayaGeminiCooldown ??= new Map<string, number>());
const COOLDOWN_MS = { busy: 60_000, rate: 30_000, daily: 60 * 60_000 };

// An overloaded model sometimes accepts a request and then goes silent; give up and fall back.
// Only real progress (a step starting or text arriving) counts, not bookkeeping events.
const FIRST_STEP_MS = 75_000;
const BETWEEN_STEPS_MS = 120_000;

async function geminiStreamOnce(model: string, system: string, input: ReturnType<typeof geminiInput>, cb: StreamCallbacks, format?: JsonSchema) {
  let text = "";
  let status = "";
  const controller = new AbortController();
  let stalled = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, ms);
  };
  arm(FIRST_STEP_MS);
  try {
    const stream = await geminiClient().interactions.create(
      {
        model,
        input,
        system_instruction: system,
        generation_config: { max_output_tokens: 65536 },
        ...(format ? { response_format: { type: "text" as const, mime_type: "application/json", schema: geminiSchema(format) as Record<string, unknown> } } : {}),
        stream: true,
      },
      // Limits are handled below by switching models, which is faster than the SDK's backoff.
      { maxRetries: 0, fetchOptions: { signal: controller.signal } },
    );
    for await (const event of stream) {
      if (event.event_type === "step.start" || event.event_type === "step.delta") arm(BETWEEN_STEPS_MS);
      if (event.event_type === "step.start") {
        cb.status(event.step.type === "thought" ? "thinking" : "writing");
      } else if (event.event_type === "step.delta" && event.delta.type === "text") {
        text += event.delta.text;
        cb.delta(event.delta.text);
      } else if (event.event_type === "interaction.completed") {
        status = event.interaction.status;
      } else if (event.event_type === "error") {
        const message = event.error?.message ?? "unknown error";
        throw classifyGemini(message) ?? new UserFacingError(`Gemini couldn't process this: ${message}`);
      }
    }
  } catch (err) {
    const limit = stalled
      ? new GeminiLimit(`${model} stopped responding`, "busy")
      : err instanceof GeminiLimit
        ? err
        : err instanceof UserFacingError
          ? null
          : classifyGemini(err instanceof Error ? err.message : "", geminiStatus(err));
    // Once text has streamed, retrying would duplicate it.
    if (limit && text) throw new UserFacingError("Gemini stopped partway through. Try again.");
    throw limit ?? err;
  } finally {
    clearTimeout(watchdog);
  }
  if (status === "failed" || status === "cancelled") throw new UserFacingError("Gemini couldn't finish. Try again.");
  return { text, truncated: status === "incomplete" };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Streams from Gemini, working around the free tier: when a model is overloaded or out of
 * requests it moves to the next model, and when all are limited it waits and tries again.
 */
async function geminiStream(system: string, parts: LlmPart[], cb: StreamCallbacks, format?: JsonSchema) {
  const input = geminiInput(parts);
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let last: GeminiLimit | null = null;

  for (let round = 0; round < 3; round++) {
    const now = Date.now();
    const ready = models.filter((m) => (cooldown.get(m) ?? 0) <= now);
    const order = ready.length ? ready : models;
    let wait = Infinity;

    for (const model of order) {
      try {
        const result = await geminiStreamOnce(model, system, input, cb, format);
        cooldown.delete(model);
        return result;
      } catch (err) {
        if (!(err instanceof GeminiLimit)) throw err;
        last = err;
        const pause = err.kind === "daily" ? COOLDOWN_MS.daily : (err.retryAfterMs ?? COOLDOWN_MS[err.kind]);
        cooldown.set(model, Date.now() + pause);
        if (err.kind !== "daily") wait = Math.min(wait, err.retryAfterMs ?? 15_000);
        console.warn(`[ai] ${model} ${err.kind === "busy" ? "is busy" : `hit its ${err.kind === "daily" ? "daily" : "per-minute"} limit`}; trying the next option`);
      }
    }

    if (wait === Infinity || round === 2) break;
    cb.status("retrying");
    await sleep(Math.min(wait + 1_000, 65_000));
  }

  if (last?.kind === "daily") throw new UserFacingError("Today's free Gemini requests are used up. They reset tomorrow, or add a Claude key in AI settings.");
  if (last?.kind === "rate") throw new UserFacingError("Gemini's free tier only allows a few requests per minute. Wait a minute and try again.");
  throw new UserFacingError("Gemini is very busy right now. Try again in a few minutes.");
}

/** HTTP status of a Gemini error. The Interactions API throws its own error classes, which aren't exported. */
function geminiStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  const status = (err as { status?: unknown } | null)?.status;
  return err instanceof Error && typeof status === "number" ? status : undefined;
}

function geminiError(err: unknown): string | null {
  if (err instanceof Error && /^APIConnection(Timeout)?Error$/.test(err.name)) return "Couldn't reach Gemini. Check the internet connection.";
  const status = geminiStatus(err);
  if (status === undefined) return null;
  const message = err instanceof Error ? err.message : "";
  if ((status === 400 && /api[ _]?key/i.test(message)) || status === 401 || status === 403) return "Gemini rejected the API key. Check it in AI settings.";
  if (status === 429) return "Gemini's free tier only allows a few requests per minute. Wait a minute and try again.";
  if (status === 400) return `Gemini couldn't process this: ${message.replace(/^400\s*/, "")}`;
  return `Gemini API error (${status}). Try again shortly.`;
}

// ───────────────────────────── public API ─────────────────────────────

export function describeAiError(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  const known = claudeError(err) ?? geminiError(err);
  if (known) return known;
  if (err instanceof TypeError && /fetch/i.test(err.message)) return "Couldn't reach the AI service. Check the internet connection.";
  console.error("[ai]", err);
  return "Something went wrong while talking to the AI.";
}

/**
 * Checks a key before it's saved, without spending generation quota.
 * Returns an error message if the provider rejects it; network trouble isn't treated as a bad key.
 */
export async function verifyAiKey(provider: AiProvider, key: string): Promise<{ ok: boolean; message?: string }> {
  try {
    if (provider === "gemini") await geminiClient(key).models.get({ model: GEMINI_MODEL });
    else await claudeClient(key).models.retrieve(CLAUDE_MODEL);
    return { ok: true };
  } catch (err) {
    const status = geminiStatus(err);
    const rejected =
      (provider === "gemini" && (status === 401 || status === 403 || (status === 400 && /api[ _]?key/i.test(err instanceof Error ? err.message : "")))) ||
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError;
    if (rejected) return { ok: false, message: `${provider === "gemini" ? "Google" : "Anthropic"} didn't accept that key. Copy it again and paste the whole thing.` };
    console.warn("[ai] couldn't verify key:", err instanceof Error ? err.message : err);
    return { ok: true, message: "Saved, but the key couldn't be checked right now." };
  }
}

/** Streams a text (Markdown) response from the configured provider. */
export async function streamText(system: string, parts: LlmPart[], cb: StreamCallbacks) {
  const provider = requireProvider();
  const result = provider === "gemini" ? await geminiStream(system, parts, cb) : await claudeStream(system, parts, cb);
  if (!result.text.trim()) throw new UserFacingError("The AI returned nothing. Try again.");
  return result;
}

/** Asks the configured provider for JSON matching `schema`, and parses it. */
export async function generateJson<T>(system: string, parts: LlmPart[], schema: JsonSchema, cb?: StreamCallbacks): Promise<T> {
  const provider = requireProvider();
  const callbacks = cb ?? { status: () => {}, delta: () => {} };
  const { text, truncated } =
    provider === "gemini" ? await geminiStream(system, parts, callbacks, schema) : await claudeStream(system, parts, callbacks, schema);
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
  } catch {
    throw new UserFacingError(truncated ? "The AI's answer was cut off. Try again with less material." : "The AI returned an unreadable answer. Try again.");
  }
}
