import "server-only";
import { aiConfigured } from "./ai-config";
import { htmlForPrompt, markdownToSafeHtml, wordCount } from "./html";
import { describeAiError, generateJson, streamText, UserFacingError, type LlmPart, type StreamCallbacks } from "./llm";
import { addAiCards, addQuestions, listCards } from "./practice";
import {
  getClass,
  getDocument,
  getDocumentInternals,
  getImportNote,
  getSection,
  getSheet,
  getUnitContext,
  listDocuments,
  listNotes,
  listSectionUnits,
  saveGeneratedSheet,
  setImportContent,
  sourcesSignature,
} from "./repo";
import { readFile } from "./storage";
import type { DocumentRow, SheetScope } from "./types";

export { aiConfigured } from "./ai-config";
export { UserFacingError } from "./llm";
export type GenerationCallbacks = StreamCallbacks;

// Native PDF input lets the model read tables, diagrams and scanned pages. Past these
// limits documents are sent as text instead.
const PDF_BYTES_BUDGET = 20 * 1024 * 1024;
const PDF_PAGES_BUDGET = 500;

const SHEET_SYSTEM = `You turn course material into study sheets for a master's student. Sheets are printed in a dense two-column layout and used to review for exams, so a sheet is only as good as the examinable knowledge it carries per line.

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

const TRANSCRIBE_SYSTEM = `You convert course documents (lecture slides, readings, handouts) into clean, faithful Markdown that a student will read and annotate as their notes.`;

const clamp = (n: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, n)));

function lengthRule(words: number) {
  const pages = words <= 950 ? "one printed page" : "two printed pages";
  return `Hard length limit: ${words} words (${pages}). If the material doesn't fit, compress wording and drop the least examinable details — never exceed the limit.`;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

interface CurriculumSource {
  title: string;
  pages: number;
  load: () => Promise<LlmPart>;
}

/** Notes converted by an AI (current "ai", or "claude" from earlier versions) are trusted as faithful text. */
const aiConverted = (doc: DocumentRow) => doc.import_method === "ai" || doc.import_method === "claude";

/**
 * Picks the best representation of each PDF. Once the student edits the note made from a
 * PDF (or an AI transcribed it), that note is the source of truth; otherwise the model reads
 * the original PDF, which preserves tables and diagrams.
 */
function curriculumSources(docs: DocumentRow[]): { sources: CurriculumSource[]; skipped: string[] } {
  let bytesUsed = 0;
  let pagesUsed = 0;
  const sources: CurriculumSource[] = [];
  const skipped: string[] = [];

  for (const doc of docs) {
    const internals = getDocumentInternals(doc.id);
    if (!internals) continue;
    const note = getImportNote(doc.id);
    const noteWords = note ? wordCount(note.content) : 0;
    const edited = Boolean(note && doc.imported_at && note.updated_at > doc.imported_at);
    const textSource = (text: string): CurriculumSource => ({
      title: doc.title,
      pages: doc.page_count,
      load: async () => ({ type: "document_text", title: doc.title, text }),
    });

    // Any edit makes her version authoritative (unless she emptied it); AI transcriptions are trusted when substantial.
    if (note && ((edited && noteWords > 0) || (aiConverted(doc) && noteWords >= 30))) {
      sources.push(textSource(htmlForPrompt(note.content)));
    } else if (bytesUsed + doc.size <= PDF_BYTES_BUDGET && pagesUsed + doc.page_count <= PDF_PAGES_BUDGET) {
      bytesUsed += doc.size;
      pagesUsed += doc.page_count;
      sources.push({
        title: doc.title,
        pages: doc.page_count,
        load: async () => ({ type: "pdf", title: doc.title, base64: (await readFile(internals.stored_name)).toString("base64") }),
      });
    } else if (noteWords > 0) {
      sources.push(textSource(htmlForPrompt(note!.content)));
    } else if (internals.text.trim()) {
      sources.push(textSource(internals.text));
    } else {
      skipped.push(doc.title);
    }
  }
  return { sources, skipped };
}

const loadSources = (sources: CurriculumSource[]) => Promise.all(sources.map((s) => s.load()));

const skippedWarning = (skipped: string[]) =>
  skipped.length ? `Skipped ${skipped.join(", ")} — too large to send and no text to work from.` : undefined;

/** Everything a unit contains, ready to send: its PDFs (or the edited notes made from them) and the student's own notes. */
function unitMaterial(unitId: number) {
  const ctx = getUnitContext(unitId);
  if (!ctx) throw new UserFacingError("That unit no longer exists.");
  const documents = listDocuments(unitId);
  const notes = listNotes(unitId).filter((n) => n.kind === "note" && wordCount(n.content) > 0);
  if (!documents.length && !notes.length) throw new UserFacingError("Add a PDF or write a note in this unit first.");

  const { sources, skipped } = curriculumSources(documents);
  const docTitles = new Map(documents.map((d) => [d.id, d.title]));
  const noteWords = notes.reduce((sum, n) => sum + wordCount(n.content), 0);
  const pages = sources.reduce((sum, s) => sum + s.pages, 0);

  const notesXml = notes.length
    ? `<student_notes>\n${notes
        .map((n) => {
          const on = n.document_id && docTitles.get(n.document_id);
          return `<note title="${escapeAttr(n.title || "Untitled")}"${on ? ` taken_on="${escapeAttr(on)}"` : ""}>\n${htmlForPrompt(n.content)}\n</note>`;
        })
        .join("\n")}\n</student_notes>`
    : "";
  return { ctx, sources, skipped, notes, notesXml, pages, noteWords };
}

async function buildSheetRequest(scope: SheetScope, scopeId: number): Promise<{ parts: LlmPart[]; warning?: string }> {
  if (scope === "document") {
    const doc = getDocument(scopeId);
    if (!doc) throw new UserFacingError("That PDF no longer exists.");
    const { sources } = curriculumSources([doc]);
    if (!sources.length) throw new UserFacingError("This PDF is too large to send and has no text to work from.");
    const words = clamp(doc.page_count * 60, 250, 900);
    return {
      parts: [
        ...(await loadSources(sources)),
        { type: "text", text: `Turn the document "${doc.title}" into a study sheet.\n\n${lengthRule(words)}` },
      ],
    };
  }

  if (scope === "unit") {
    const { ctx, sources, skipped, notes, notesXml, pages, noteWords } = unitMaterial(scopeId);
    const words = clamp(pages * 35 + noteWords * 0.4, 400, 1600);

    const sourceList = [
      sources.length ? `the ${sources.length} curriculum document${sources.length > 1 ? "s" : ""} above` : "",
      notes.length ? "the student's own notes" : "",
    ]
      .filter(Boolean)
      .join(" and ");

    const instructions = `Build one combined study sheet for the unit "${ctx.unit.name}" (${ctx.klass.name} › ${ctx.section.name}) from ${sourceList}.

Combining:
- Organize by topic, not by source.
- Curriculum documents may contain the student's own edits: text they highlighted (<mark>), bolded or underlined is what they consider important — make sure it's on the sheet.${
      notes.length
        ? `
- The student's separate notes are high priority: keep every substantive point they make, merged into the matching topic. Start each bullet that comes from or adds to those notes with ★.
- Where their notes disagree with the curriculum, keep the curriculum version and add theirs flagged ★⚠.`
        : ""
    }

${lengthRule(words)}`;

    return {
      parts: [
        ...(await loadSources(sources)),
        ...(notesXml ? [{ type: "text" as const, text: notesXml }] : []),
        { type: "text", text: instructions },
      ],
      warning: skippedWarning(skipped),
    };
  }

  const section = getSection(scopeId);
  const klass = section && getClass(section.class_id);
  if (!section || !klass) throw new UserFacingError("That section no longer exists.");
  const unitSheets = listSectionUnits(scopeId).flatMap((u) => {
    const sheet = getSheet("unit", u.id);
    return sheet ? [{ unit: u, sheet }] : [];
  });
  if (!unitSheets.length) throw new UserFacingError("Generate at least one unit study sheet in this section first.");
  const words = clamp(unitSheets.length * 350, 600, 1800);
  return {
    parts: [
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

/** Streams a study sheet from the configured AI and saves it. */
export async function generateSheet(scope: SheetScope, scopeId: number, cb: GenerationCallbacks): Promise<{ html: string; warning?: string }> {
  try {
    if (!aiConfigured()) throw new UserFacingError("Add a free Gemini API key (or a Claude key) in AI settings to build study sheets.");
    cb.status("reading");
    const sig = sourcesSignature(scope, scopeId);
    const { parts, warning } = await buildSheetRequest(scope, scopeId);
    const { text, truncated } = await streamText(SHEET_SYSTEM, parts, cb);
    const html = markdownToSafeHtml(text.trim());
    saveGeneratedSheet(scope, scopeId, html, sig);
    const cut = truncated ? "The sheet hit the length cap and may be cut off." : undefined;
    return { html, warning: [warning, cut].filter(Boolean).join(" ") || undefined };
  } catch (err) {
    throw new UserFacingError(describeAiError(err));
  }
}

const PRACTICE_SYSTEM = `You write retrieval-practice material — flashcards and multiple-choice questions — for a master's student, from their course material. The goal is long-term retention of what will be examined.

Flashcards:
- One fact per card. Front: a term, concept or pointed question (≤ 15 words). Back: the answer in ≤ 30 words; compressed fragments are fine.
- For a definition, put the term on the front and its meaning on the back.
- Cover the most examinable material across all sources: definitions, mechanisms, frameworks and their components, distinctions between easily confused ideas, cause → effect, key numbers.
- Skip trivia: course logistics, instructor names, slide numbers, learning objectives.

Questions:
- Test understanding or application where the material allows (e.g. "Which mechanism explains…", a short scenario), not only recall.
- Exactly one correct answer and three plausible distractors from the same topic, of similar length and grammar. No "all/none of the above", no joke options.
- "answer" is the 0-based index of the correct choice. "explanation" is one sentence (≤ 25 words) on why it's right.

Stay faithful to the sources and keep the course's terminology. Plain text only — no Markdown, no LaTeX (use Unicode for formulas).`;

const PRACTICE_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { front: { type: "string" }, back: { type: "string" } },
        required: ["front", "back"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["prompt", "choices", "answer", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards", "questions"],
  additionalProperties: false,
};

interface PracticeOutput {
  cards: { front: string; back: string }[];
  questions: { prompt: string; choices: string[]; answer: number; explanation: string }[];
}

/** Has the AI write flashcards and quiz questions for a unit, skipping cards the unit already has. */
export async function generatePractice(unitId: number, cb: GenerationCallbacks): Promise<{ html: string; warning?: string; message: string }> {
  try {
    if (!aiConfigured()) throw new UserFacingError("Add a free Gemini API key (or a Claude key) in AI settings to generate practice.");
    cb.status("reading");
    const { ctx, sources, skipped, notesXml, pages, noteWords } = unitMaterial(unitId);
    const cardTarget = clamp(pages * 1.5 + noteWords / 120, 12, 40);
    const questionTarget = clamp(cardTarget / 2, 6, 15);
    const existing = listCards(unitId)
      .slice(0, 250)
      .map((c) => `- ${c.front}`)
      .join("\n");

    const parts: LlmPart[] = [
      ...(await loadSources(sources)),
      ...(notesXml ? [{ type: "text" as const, text: notesXml }] : []),
      {
        type: "text",
        text: `Write about ${cardTarget} flashcards and ${questionTarget} multiple-choice questions (4 choices each) for the unit "${ctx.unit.name}" (${ctx.klass.name} › ${ctx.section.name}).${
          notesXml ? " Treat the student's own notes as high priority." : ""
        }${existing ? `\n\nThe student already has these cards — don't repeat them:\n${existing}` : ""}`,
      },
    ];

    // Streamed JSON isn't readable mid-way, so only show progress.
    const output = await generateJson<PracticeOutput>(PRACTICE_SYSTEM, parts, PRACTICE_SCHEMA, { status: cb.status, delta: () => cb.status("writing") });
    const cards = Array.isArray(output.cards) ? output.cards.filter((c) => typeof c?.front === "string" && typeof c?.back === "string") : [];
    const questions = Array.isArray(output.questions)
      ? output.questions.filter(
          (q) => typeof q?.prompt === "string" && Array.isArray(q.choices) && q.choices.every((c) => typeof c === "string") && typeof q.answer === "number",
        )
      : [];
    const addedCards = addAiCards(unitId, cards, "AI practice set");
    const addedQuestions = addQuestions(unitId, questions.map((q) => ({ ...q, explanation: typeof q.explanation === "string" ? q.explanation : "" })));
    if (!addedCards && !addedQuestions) throw new UserFacingError("The AI didn't come up with anything new for this unit. Add more notes and try again.");

    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
    return {
      html: "",
      message: `Added ${plural(addedCards, "flashcard")} and ${plural(addedQuestions, "quiz question")}.`,
      warning: skippedWarning(skipped),
    };
  } catch (err) {
    throw new UserFacingError(describeAiError(err));
  }
}

/** Has the AI transcribe a PDF (including scanned pages) into the editable note that replaces its current text. */
export async function transcribeDocument(documentId: number, cb: GenerationCallbacks): Promise<{ html: string; warning?: string }> {
  try {
    if (!aiConfigured()) throw new UserFacingError("Add a free Gemini API key (or a Claude key) in AI settings to convert PDFs.");
    const doc = getDocument(documentId);
    const internals = getDocumentInternals(documentId);
    if (!doc || !internals) throw new UserFacingError("That PDF no longer exists.");
    if (doc.size > PDF_BYTES_BUDGET || doc.page_count > PDF_PAGES_BUDGET)
      throw new UserFacingError("This PDF is too large to convert in one go (over 500 pages or 20 MB).");
    cb.status("reading");

    const parts: LlmPart[] = [
      { type: "pdf", title: doc.title, base64: (await readFile(internals.stored_name)).toString("base64") },
      {
        type: "text",
        text: `Transcribe "${doc.title}" into Markdown notes.

- Keep all of the content. Do not summarize, shorten, reorder or add anything.
- Make it easy to read and study from:
  - ## for slide or section titles, ### for subsections, #### for minor headings.
  - Keep bullet and numbered lists, and their nesting — indent sub-points under the point they belong to.
  - Bold each key term where it's defined or introduced (\`**Term**: meaning\`), and keep the source's own bold and italics.
  - Put notes, warnings, key points, tips and clinical pearls in a blockquote that starts with a bold label (\`> **Key point:** …\`).
  - Use Markdown tables for tabular data, and plain Unicode for formulas with real superscripts and subscripts (x², H₂O, no LaTeX).
  - For slide decks, separate slides with a horizontal rule (---).
  - Join lines the PDF broke mid-sentence into normal paragraphs.
- For each figure, chart or diagram, add one italic line describing what it shows.
- Drop page numbers, repeated headers and footers, and slide-template boilerplate.
- Start directly with the content.`,
      },
    ];

    const { text, truncated } = await streamText(TRANSCRIBE_SYSTEM, parts, cb);
    const html = markdownToSafeHtml(text.trim());
    setImportContent(documentId, html, "ai");
    return { html, warning: truncated ? "This PDF is very long; the end may be missing. The original PDF is still attached." : undefined };
  } catch (err) {
    throw new UserFacingError(describeAiError(err));
  }
}
