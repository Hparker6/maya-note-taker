import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { htmlForPrompt, markdownToSafeHtml, wordCount } from "./html";
import {
  getDocument,
  getDocumentInternals,
  getSection,
  getClass,
  getSheet,
  getUnitContext,
  listDocuments,
  listNotes,
  listSectionUnits,
  saveGeneratedSheet,
  sourcesSignature,
} from "./repo";
import { readFile } from "./storage";
import type { JobStatus, SheetScope } from "./types";

const MODEL = "claude-opus-5";

// Native PDF input lets Claude read tables, diagrams and scanned pages. Past these
// limits (32 MB request / 600 pages) documents are sent as extracted text instead.
const PDF_BYTES_BUDGET = 20 * 1024 * 1024;
const PDF_PAGES_BUDGET = 500;

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** A problem the student can fix; its message is shown in the UI as-is. */
export class UserFacingError extends Error {}

const SYSTEM = `You turn course material into study sheets for a master's student. Sheets are printed in a dense two-column layout and used to review for exams, so a sheet is only as good as the examinable knowledge it carries per line.

Keep: definitions; frameworks and models with their components; processes as step chains; formulas with what each variable means; numbers, thresholds and dates; named theories, authors, cases and studies with what each showed; distinctions between easily confused ideas; cause → effect relationships.
Cut: introductions, learning objectives, motivational framing, repeated examples, administrative details, and anything a master's student already knows.

Format (Markdown):
- Begin directly with the first \`##\` topic heading. No title, preamble, closing summary or "key takeaways".
- \`##\` for topics; \`###\` only when a topic has clearly separate parts. Short headings.
- Bullets are compressed fragments, not sentences. Lead with the term in bold: \`- **Term**: meaning; key detail\`.
- Nest at most one level. Put tightly related facts on one line separated by "; ".
- Use symbols and standard abbreviations: → ↑ ↓ ≈ ≠ ≥ ≤ ∴ Δ vs w/ w/o b/c e.g. i.e. Define a course-specific abbreviation once.
- Use a compact table when comparing three or more items on the same attributes.
- Write formulas in plain Unicode (e.g. σ² = Σ(xᵢ − x̄)² / (n − 1)), never LaTeX.
- Wrap the few highest-yield facts in ==double equals== to highlight them — about one per topic.
- State each fact once; merge overlapping material from different sources.
- Stay faithful to the sources: add no outside facts and keep the course's terminology.`;

const clamp = (n: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, n)));

function lengthRule(words: number) {
  const pages = words <= 950 ? "one printed page" : "two printed pages";
  return `Hard length limit: ${words} words (${pages}). If the material doesn't fit, compress wording and drop the least examinable details — never exceed the limit.`;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

interface PreparedDoc {
  title: string;
  pages: number;
  bytes: number;
  load: () => Promise<Block>;
}

function prepareDocuments(ids: number[]): { docs: PreparedDoc[]; skipped: string[] } {
  let bytesUsed = 0;
  let pagesUsed = 0;
  const docs: PreparedDoc[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const doc = getDocument(id);
    const internals = getDocumentInternals(id);
    if (!doc || !internals) continue;
    const native = bytesUsed + doc.size <= PDF_BYTES_BUDGET && pagesUsed + doc.page_count <= PDF_PAGES_BUDGET;
    if (native) {
      bytesUsed += doc.size;
      pagesUsed += doc.page_count;
      docs.push({
        title: doc.title,
        pages: doc.page_count,
        bytes: doc.size,
        load: async () => ({
          type: "document",
          title: doc.title,
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: (await readFile(internals.stored_name)).toString("base64"),
          },
        }),
      });
    } else if (internals.text.trim()) {
      docs.push({
        title: doc.title,
        pages: doc.page_count,
        bytes: 0,
        load: async () => ({
          type: "document",
          title: doc.title,
          source: { type: "text", media_type: "text/plain", data: internals.text },
        }),
      });
    } else {
      skipped.push(doc.title);
    }
  }
  return { docs, skipped };
}

async function loadDocs(docs: PreparedDoc[]): Promise<Block[]> {
  const blocks = await Promise.all(docs.map((d) => d.load()));
  // Cache the (large, stable) documents so "Regenerate" soon after is cheap.
  const last = blocks.at(-1);
  if (last && last.type === "document") last.cache_control = { type: "ephemeral" };
  return blocks;
}

async function buildRequest(scope: SheetScope, scopeId: number): Promise<{ content: Block[]; warning?: string }> {
  if (scope === "document") {
    const doc = getDocument(scopeId);
    if (!doc) throw new UserFacingError("That PDF no longer exists.");
    const { docs, skipped } = prepareDocuments([scopeId]);
    if (skipped.length || !docs.length)
      throw new UserFacingError("This PDF is too large to send and has no extractable text.");
    const words = clamp(doc.page_count * 60, 250, 900);
    return {
      content: [
        ...(await loadDocs(docs)),
        { type: "text", text: `Turn the document "${doc.title}" into a study sheet.\n\n${lengthRule(words)}` },
      ],
    };
  }

  if (scope === "unit") {
    const ctx = getUnitContext(scopeId);
    if (!ctx) throw new UserFacingError("That unit no longer exists.");
    const documents = listDocuments(scopeId);
    const notes = listNotes(scopeId).filter((n) => wordCount(n.content) > 0);
    if (!documents.length && !notes.length)
      throw new UserFacingError("Add a PDF or write a note in this unit first.");

    const { docs, skipped } = prepareDocuments(documents.map((d) => d.id));
    const docTitles = new Map(documents.map((d) => [d.id, d.title]));
    const noteWords = notes.reduce((sum, n) => sum + wordCount(n.content), 0);
    const pages = docs.reduce((sum, d) => sum + d.pages, 0);
    const words = clamp(pages * 35 + noteWords * 0.4, 400, 1600);

    const notesXml = notes.length
      ? `<student_notes>\n${notes
          .map((n) => {
            const on = n.document_id && docTitles.get(n.document_id);
            return `<note title="${escapeAttr(n.title || "Untitled")}"${on ? ` taken_on="${escapeAttr(on)}"` : ""}>\n${htmlForPrompt(n.content)}\n</note>`;
          })
          .join("\n")}\n</student_notes>`
      : "";

    const sources = [
      docs.length ? `the ${docs.length} curriculum document${docs.length > 1 ? "s" : ""} above` : "",
      notes.length ? "the student's own notes" : "",
    ]
      .filter(Boolean)
      .join(" and ");

    const instructions = `Build one combined study sheet for the unit "${ctx.unit.name}" (${ctx.klass.name} › ${ctx.section.name}) from ${sources}.

Combining:
- Organize by topic, not by source.${
      notes.length
        ? `
- The student's notes are high priority: keep every substantive point they make, merged into the matching topic. Start each bullet that comes from or adds to their notes with ★.
- Text they highlighted (<mark>), bolded or underlined is what they consider important — make sure it's on the sheet.
- Where their notes disagree with the curriculum, keep the curriculum version and add theirs flagged ★⚠.`
        : ""
    }

${lengthRule(words)}`;

    return {
      content: [
        ...(await loadDocs(docs)),
        ...(notesXml ? [{ type: "text" as const, text: notesXml }] : []),
        { type: "text", text: instructions },
      ],
      warning: skipped.length
        ? `Skipped ${skipped.join(", ")} — too large to send and no extractable text.`
        : undefined,
    };
  }

  const section = getSection(scopeId);
  const klass = section && getClass(section.class_id);
  if (!section || !klass) throw new UserFacingError("That section no longer exists.");
  const unitSheets = listSectionUnits(scopeId).flatMap((u) => {
    const sheet = getSheet("unit", u.id);
    return sheet ? [{ unit: u, sheet }] : [];
  });
  if (!unitSheets.length)
    throw new UserFacingError("Generate at least one unit study sheet in this section first.");
  const words = clamp(unitSheets.length * 350, 600, 1800);
  return {
    content: [
      {
        type: "text",
        text: unitSheets
          .map(({ unit, sheet }) => `<unit_sheet unit="${escapeAttr(unit.name)}">\n${htmlForPrompt(sheet.content)}\n</unit_sheet>`)
          .join("\n"),
      },
      {
        type: "text",
        text: `Build an exam review sheet for the section "${section.name}" (${klass.name}) from the unit sheets above. Go a level higher than the unit sheets: keep the most examinable material, connect ideas across units where the connection itself is testable, and drop detail that wouldn't be tested. Keep ★ on points that came from the student's own notes.

${lengthRule(words)}`,
      },
    ],
  };
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function describeApiError(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof Anthropic.AuthenticationError)
    return "Claude rejected the API key. Check ANTHROPIC_API_KEY in your environment.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return "This API key doesn't have access to Claude Opus 5.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limiting requests. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `Claude couldn't process these files: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "unknown"}). Try again shortly.`;
  if (err instanceof Error && /api key|apiKey|authToken/i.test(err.message))
    return "Add ANTHROPIC_API_KEY to .env.local to enable study sheets.";
  console.error("[sheet generation]", err);
  return "Something went wrong while generating the sheet.";
}

export interface GenerationCallbacks {
  status: (s: JobStatus) => void;
  delta: (text: string) => void;
}

/** Streams a study sheet from Claude and saves it. Returns the saved HTML. */
export async function generateSheet(
  scope: SheetScope,
  scopeId: number,
  cb: GenerationCallbacks,
): Promise<{ html: string; warning?: string }> {
  try {
    if (!aiConfigured()) throw new UserFacingError("Add ANTHROPIC_API_KEY to .env.local to enable study sheets.");
    cb.status("reading");
    const sig = sourcesSignature(scope, scopeId);
    const { content, warning } = await buildRequest(scope, scopeId);

    const client = new Anthropic();
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      thinking: { type: "adaptive" },
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
    if (message.stop_reason === "refusal")
      throw new UserFacingError("Claude declined to process this material. Try removing unusual content and regenerate.");

    const markdown = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!markdown) throw new UserFacingError("Claude returned an empty sheet. Try regenerating.");

    const html = markdownToSafeHtml(markdown);
    saveGeneratedSheet(scope, scopeId, html, sig);
    const truncated = message.stop_reason === "max_tokens" ? "The sheet hit the length cap and may be cut off." : undefined;
    return { html, warning: [warning, truncated].filter(Boolean).join(" ") || undefined };
  } catch (err) {
    throw new UserFacingError(describeApiError(err));
  }
}
