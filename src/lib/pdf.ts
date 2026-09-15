import "server-only";
import { getDocumentProxy } from "unpdf";

export interface ExtractedPdf {
  pageCount: number;
  /** Plain text, used for search. */
  text: string;
  /** Structured, editable rich text (headings, nested lists, emphasis, callouts). */
  html: string;
  /** True when there is (almost) no selectable text, e.g. a scanned PDF. */
  scanned: boolean;
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

/** A stretch of text in one style. */
interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  script?: "sup" | "sub";
}

interface Line {
  runs: Run[];
  text: string;
  size: number;
  x: number;
  y: number;
  endX: number;
}

interface Block {
  type: "h2" | "h3" | "h4" | "p" | "li" | "hr" | "callout";
  runs: Run[];
  size: number;
  x: number;
  y: number;
  /** List nesting depth (0 = top level). */
  level: number;
  ordered: boolean;
}

// Bullet glyphs, including the private-use symbols PowerPoint and Word export from Wingdings/Symbol.
const GLYPH_BULLET = /^\s*([•◦▪▫●○■□►▶▸▹➢➤➔→⇒✓✔✗❖◆◇·])\s*/;
const DASH_BULLET = /^\s*([*\-–—])\s+/;
const ORDERED = /^\s*(\(?\d{1,2}[.)]|\(?[a-hA-H][.)]|\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)])\s+/;
const PAGE_NUMBER = /^\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i;
const CALLOUT = /^(notes?|important|key (?:point|idea|takeaway|concept)s?|remember|tip|warning|caution|clinical (?:pearl|correlation)|pearl|take-?home message|bottom line)\s*[:!–—-]\s*/i;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");
const sameStyle = (a: Run, b: Run) => a.bold === b.bold && a.italic === b.italic && a.script === b.script;
const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function pushRun(runs: Run[], run: Run) {
  if (!run.text) return;
  const last = runs.at(-1);
  if (last && sameStyle(last, run)) last.text += run.text;
  else runs.push({ ...run });
}

/** Tidies text pdf.js hands back: ligatures, soft hyphens, runs of spaces. */
function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const text = r.text
      .replace(/[ﬀ-ﬆ]/g, (c) => c.normalize("NFKC"))
      .replace(/­/g, "")
      .replace(/\s+/g, " ");
    pushRun(out, { ...r, text });
  }
  // Collapse spaces across run boundaries and trim the ends.
  for (let i = 1; i < out.length; i++) if (out[i - 1].text.endsWith(" ") && out[i].text.startsWith(" ")) out[i].text = out[i].text.slice(1);
  if (out.length) {
    out[0].text = out[0].text.trimStart();
    out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  }
  return out.filter((r) => r.text);
}

/** Drops the first `n` characters (e.g. a bullet marker) from styled runs. */
function sliceRuns(runs: Run[], n: number): Run[] {
  const out: Run[] = [];
  let skip = n;
  for (const r of runs) {
    if (skip >= r.text.length) {
      skip -= r.text.length;
      continue;
    }
    out.push({ ...r, text: r.text.slice(skip) });
    skip = 0;
  }
  if (out.length) out[0].text = out[0].text.trimStart();
  return out.filter((r) => r.text);
}

/** Makes the first `n` characters bold. */
function boldPrefix(runs: Run[], n: number): Run[] {
  const out: Run[] = [];
  let left = n;
  for (const r of runs) {
    if (left <= 0) out.push(r);
    else if (r.text.length <= left) {
      out.push({ ...r, bold: true });
      left -= r.text.length;
    } else {
      out.push({ ...r, text: r.text.slice(0, left), bold: true }, { ...r, text: r.text.slice(left) });
      left = 0;
    }
  }
  return out;
}

/** Whether each font on the page is bold or italic. Needs the page's operator list, so it's time-boxed. */
async function fontStyles(page: PdfPage, names: Set<string>, budget: { ms: number }) {
  const styles = new Map<string, { bold: boolean; italic: boolean }>();
  if (!names.size || budget.ms <= 0) return styles;
  const started = Date.now();
  try {
    await page.getOperatorList();
  } catch {
    return styles;
  } finally {
    budget.ms -= Date.now() - started;
  }
  for (const name of names) {
    try {
      const font = page.commonObjs.get(name) as { name?: string; bold?: boolean; black?: boolean; italic?: boolean } | undefined;
      const fontName = font?.name ?? "";
      styles.set(name, {
        bold: Boolean(font?.bold || font?.black || /bold|black|heavy|semibold|demi/i.test(fontName)),
        italic: Boolean(font?.italic || /italic|oblique/i.test(fontName)),
      });
    } catch {}
  }
  return styles;
}

async function readLines(pdf: PdfDocument) {
  const pages: { lines: Line[]; landscape: boolean }[] = [];
  const budget = { ms: 25_000 };
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const fontNames = new Set(content.items.flatMap((item) => ("str" in item && item.str.trim() ? [item.fontName] : [])));
    const styles = await fontStyles(page, fontNames, budget);

    const lines: Line[] = [];
    let current: Line | null = null;
    const flush = () => {
      if (current) {
        const runs = normalizeRuns(current.runs);
        const text = runsText(runs);
        if (text.trim()) lines.push({ ...current, runs, text });
      }
      current = null;
    };
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [a, b, , d, x, y] = item.transform as number[];
      const size = Math.hypot(b, d) || Math.abs(a) || item.height || 0;
      const style = styles.get(item.fontName) ?? { bold: false, italic: false };
      if (item.str) {
        const line = current as Line | null;
        if (line && Math.abs(y - line.y) <= Math.max(line.size, size) * 0.5) {
          // Smaller text raised or lowered within a line: x², H₂O, footnote markers.
          let script: Run["script"];
          if (size < line.size * 0.8 && line.text.trim()) {
            const dy = y - line.y;
            if (dy > line.size * 0.2) script = "sup";
            else if (dy < -line.size * 0.1) script = "sub";
          }
          const gap = x - line.endX;
          if (!script && gap > size * 0.12 && !line.text.endsWith(" ") && !item.str.startsWith(" ")) {
            pushRun(line.runs, { text: " ", ...(line.runs.at(-1) ?? style) });
            line.text += " ";
          }
          pushRun(line.runs, { text: item.str, ...style, script });
          line.text += item.str;
          line.endX = x + item.width;
          if (!script) line.size = Math.max(line.size, size);
        } else {
          flush();
          current = { runs: [{ text: item.str, ...style }], text: item.str, size, x, y, endX: x + item.width };
        }
      }
      if (item.hasEOL) flush();
    }
    flush();
    pages.push({ lines, landscape: viewport.width > viewport.height });
    page.cleanup();
  }
  return pages;
}

/** Lines that repeat at the top or bottom of most pages (running headers, footers). */
function repeatedEdges(pages: { lines: Line[] }[]) {
  if (pages.length < 3) return new Set<string>();
  const counts = new Map<string, number>();
  for (const { lines } of pages) {
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((l) => l.text.replace(/\d+/g, "#")));
    for (const key of edges) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.5));
  return new Set([...counts].filter(([, c]) => c >= threshold).map(([k]) => k));
}

const roundSize = (size: number) => Math.round(size * 2) / 2;

function bodySize(pages: { lines: Line[] }[]) {
  const weights = new Map<number, number>();
  for (const { lines } of pages)
    for (const l of lines) weights.set(roundSize(l.size), (weights.get(roundSize(l.size)) ?? 0) + l.text.length);
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weights) if (w > bestWeight) [best, bestWeight] = [size, w];
  return best || 12;
}

const isAllBold = (line: Line) => line.runs.every((r) => r.bold || !r.text.trim());
const bulletMatch = (text: string) => GLYPH_BULLET.exec(text) ?? DASH_BULLET.exec(text);

function toBlocks(pages: { lines: Line[]; landscape: boolean }[]): Block[] {
  const skip = repeatedEdges(pages);
  const body = bodySize(pages);
  const slides = pages.filter((p) => p.landscape).length > pages.length / 2;
  const blocks: Block[] = [];

  // Documents set entirely in bold carry no signal in boldness.
  let boldChars = 0;
  let allChars = 0;
  for (const { lines } of pages)
    for (const l of lines)
      for (const r of l.runs) {
        allChars += r.text.length;
        if (r.bold) boldChars += r.text.length;
      }
  const useBold = allChars > 0 && boldChars / allChars < 0.4;
  if (!useBold) for (const { lines } of pages) for (const l of lines) for (const r of l.runs) r.bold = false;

  // Bigger type → higher heading level; bold lines at body size sit one level below the smallest.
  const headingSizes = [
    ...new Set(pages.flatMap(({ lines }) => lines.filter((l) => l.size / body >= 1.18 && l.text.length <= 140).map((l) => roundSize(l.size)))),
  ].sort((a, b) => b - a);
  const sizeLevel = (size: number) => Math.min(4, 2 + Math.max(0, headingSizes.indexOf(roundSize(size)))) as 2 | 3 | 4;
  const boldLevel = (headingSizes.length ? Math.min(4, 2 + headingSizes.length) : 3) as 2 | 3 | 4;
  const heading = (level: 2 | 3 | 4, line: Line): Block => ({
    type: `h${level}`,
    runs: line.runs.map((r) => ({ ...r, bold: false })),
    size: line.size,
    x: line.x,
    y: line.y,
    level: 0,
    ordered: false,
  });

  let listStack: number[] = [];

  pages.forEach(({ lines }, pageIndex) => {
    if (pageIndex > 0 && slides && blocks.length && blocks.at(-1)!.type !== "hr") blocks.push({ type: "hr", runs: [], size: 0, x: 0, y: 0, level: 0, ordered: false });
    let prev: Block | null = null;

    lines.forEach((line, lineIndex) => {
      const isEdge = lineIndex < 2 || lineIndex >= lines.length - 2;
      if (PAGE_NUMBER.test(line.text) || (isEdge && skip.has(line.text.replace(/\d+/g, "#")))) return;

      const text = line.text;
      const ratio = line.size / body;
      const bullet = bulletMatch(text);
      const ordered = !bullet && ORDERED.exec(text);
      // Word exports second-level bullets as a Courier "o".
      const oBullet = !bullet && !ordered && prev?.type === "li" && /^o\s+\S/.test(text) && line.x > prev.x + line.size * 0.5;
      let block: Block;

      if (ratio >= 1.18 && text.length <= 140 && !bullet) {
        block = heading(sizeLevel(line.size), line);
        // Headings that wrap onto a second line of the same size continue the heading.
        if (prev && prev.type === block.type && Math.abs(prev.size - line.size) < 0.5 && prev.y - line.y <= line.size * 1.6) {
          pushRun(prev.runs, { text: " ", bold: false, italic: false });
          for (const r of block.runs) pushRun(prev.runs, r);
          prev.y = line.y;
          return;
        }
      } else if ((bullet && text.length > bullet[0].length) || ordered || oBullet) {
        const markerLength = bullet ? bullet[0].length : ordered ? ordered[0].length : 2;
        // Nesting follows indentation: each distinct x position further right is one level deeper.
        const tolerance = line.size * 0.8;
        if (!prev || prev.type !== "li" || !listStack.length) listStack = [line.x];
        while (listStack.length > 1 && line.x < listStack.at(-1)! - tolerance) listStack.pop();
        if (line.x > listStack.at(-1)! + tolerance) listStack.push(line.x);
        block = {
          type: "li",
          runs: sliceRuns(line.runs, markerLength),
          size: line.size,
          x: line.x,
          y: line.y,
          level: listStack.length - 1,
          ordered: Boolean(ordered),
        };
      } else {
        const allBold = useBold && isAllBold(line);
        const gap = prev ? prev.y - line.y : Infinity;
        const sameSize = prev ? Math.abs(prev.size - line.size) / body < 0.12 : false;
        const prevText = prev ? runsText(prev.runs) : "";
        // A bold line after a finished sentence starts something new rather than wrapping.
        const styleBreak = allBold && prev && !prev.runs.at(-1)?.bold && /[.:!?]$/.test(prevText);
        const continues =
          prev &&
          (prev.type === "p" || prev.type === "li") &&
          sameSize &&
          !styleBreak &&
          gap > 0 &&
          gap <= line.size * 1.75 &&
          // Wrapped bullet text sits to the right of the bullet.
          (prev.type === "p" || line.x > prev.x + line.size * 0.3);
        if (continues && prev) {
          const last = prev.runs.at(-1);
          if (last && /[a-z]-$/.test(last.text) && /^[a-z]/.test(text)) last.text = last.text.slice(0, -1);
          else pushRun(prev.runs, { text: " ", bold: Boolean(last?.bold && line.runs[0]?.bold), italic: Boolean(last?.italic && line.runs[0]?.italic) });
          for (const r of line.runs) pushRun(prev.runs, r);
          prev.y = line.y;
          return;
        }

        const next = lines[lineIndex + 1];
        const boldParagraph =
          next && isAllBold(next) && Math.abs(next.size - line.size) < 0.5 && line.y - next.y <= line.size * 1.75 && !bulletMatch(next.text);
        const letters = text.replace(/[^A-Za-z]/g, "");
        const allCaps = letters.length >= 6 && letters === letters.toUpperCase() && text.length <= 70 && words(text) >= 2;

        if (allBold && text.length <= 90 && words(text) <= 12 && !/[.,;]$/.test(text) && !boldParagraph) block = heading(boldLevel, line);
        else if (allCaps && !bullet) block = heading(boldLevel, { ...line, runs: line.runs });
        else block = { type: "p", runs: line.runs.map((r) => ({ ...r })), size: line.size, x: line.x, y: line.y, level: 0, ordered: false };
      }
      blocks.push(block);
      prev = block;
    });
  });
  while (blocks.at(-1)?.type === "hr") blocks.pop();

  for (const b of blocks) {
    if (b.type !== "p" && b.type !== "li") continue;
    const text = runsText(b.runs);
    const callout = b.type === "p" && CALLOUT.exec(text);
    if (callout) {
      b.type = "callout";
      b.runs = boldPrefix(b.runs, callout[0].trimEnd().length);
      continue;
    }
    // "Term: definition" → bold the term, unless the line already has its own emphasis up front.
    const term = /^([A-Z0-9(][^:]{0,48}?):\s+(?=\S)/.exec(text);
    if (
      term &&
      words(term[1]) <= 4 &&
      !/https?$/i.test(term[1]) &&
      !/^(the|this|these|those|that|it|we|you|they|there|here|in|for|as|when|if|our|so|but|and|or|note)\b/i.test(term[1]) &&
      !b.runs.slice(0, 2).some((r) => r.bold)
    )
      b.runs = boldPrefix(b.runs, term[1].length + 1);
  }
  return blocks;
}

/** Escapes text and turns bare URLs into links. */
function linkify(text: string) {
  return text
    .split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'])/g)
    .map((part, i) => (i % 2 ? `<a href="${escapeAttr(part)}">${escapeHtml(part)}</a>` : escapeHtml(part)))
    .join("");
}

function runsHtml(runs: Run[]) {
  return runs
    .map((r) => {
      const core = r.text.trim();
      if (!core) return " ";
      let html = linkify(core);
      if (r.script) html = `<${r.script}>${html}</${r.script}>`;
      if (r.italic) html = `<em>${html}</em>`;
      if (r.bold) html = `<strong>${html}</strong>`;
      return `${/^\s/.test(r.text) ? " " : ""}${html}${/\s$/.test(r.text) ? " " : ""}`;
    })
    .join("")
    .replace(/ {2,}/g, " ")
    // No stray space before punctuation after a styled word, or before a superscript/subscript.
    .replace(/<\/(strong|em)> ([,.;:!?)])/g, "</$1>$2")
    .replace(/ <(sup|sub)>/g, "<$1>")
    .trim();
}

/** Consecutive list items → properly nested <ul>/<ol>. */
function listHtml(items: Block[]) {
  let html = "";
  const stack: ("ul" | "ol")[] = [];
  for (const item of items) {
    const tag = item.ordered ? "ol" : "ul";
    const level = Math.min(item.level, stack.length);
    while (stack.length > level + 1) html += `</li></${stack.pop()}>`;
    if (stack.length === level + 1) {
      if (stack[level] === tag) html += "</li>";
      else {
        html += `</li></${stack.pop()}><${tag}>`;
        stack.push(tag);
      }
    } else {
      html += `<${tag}>`;
      stack.push(tag);
    }
    html += `<li><p>${runsHtml(item.runs)}</p>`;
  }
  while (stack.length) html += `</li></${stack.pop()}>`;
  return html;
}

function blocksToHtml(blocks: Block[]) {
  let html = "";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "li") {
      const items: Block[] = [];
      while (i < blocks.length && blocks[i].type === "li") items.push(blocks[i++]);
      i--;
      html += listHtml(items);
    } else if (b.type === "hr") {
      html += "<hr>";
    } else {
      const inner = runsHtml(b.runs);
      if (!inner) continue;
      html += b.type === "callout" ? `<blockquote><p>${inner}</p></blockquote>` : `<${b.type}>${inner}</${b.type}>`;
    }
  }
  return html;
}

/** Page count, searchable text, and an editable, formatted version of the PDF. */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  // pdf.js may transfer the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages = await readLines(pdf);
    const text = pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n\n");
    const chars = text.replace(/\s/g, "").length;
    return {
      pageCount: pdf.numPages,
      text,
      html: blocksToHtml(toBlocks(pages)),
      scanned: chars < Math.max(40, pdf.numPages * 25),
    };
  } finally {
    await pdf.cleanup();
  }
}

export function isPdf(bytes: Uint8Array) {
  return bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}
