import "server-only";
import { getDocumentProxy } from "unpdf";

export interface ExtractedPdf {
  pageCount: number;
  /** Plain text, used for search. */
  text: string;
  /** Structured, editable rich text (headings, lists, paragraphs). */
  html: string;
  /** True when there is (almost) no selectable text, e.g. a scanned PDF. */
  scanned: boolean;
}

interface Line {
  text: string;
  size: number;
  x: number;
  y: number;
  endX: number;
}

interface Block {
  type: "h2" | "h3" | "p" | "ul" | "ol" | "hr";
  text: string;
  size: number;
  x: number;
  y: number;
}

const BULLET = /^\s*([•◦▪▫●○■□►▶➢➤✓✔·*\-–—])\s*/;
const ORDERED = /^\s*(\(?\d{1,2}[.)]|\(?[a-hA-H][.)])\s+/;
const PAGE_NUMBER = /^\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function readLines(pdf: Awaited<ReturnType<typeof getDocumentProxy>>) {
  const pages: { lines: Line[]; landscape: boolean }[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines: Line[] = [];
    let current: Line | null = null;
    const flush = () => {
      if (current && current.text.trim()) lines.push({ ...current, text: current.text.replace(/\s+/g, " ").trim() });
      current = null;
    };
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [a, b, , d, x, y] = item.transform as number[];
      const size = Math.hypot(b, d) || Math.abs(a) || item.height || 0;
      if (item.str) {
        const line = current as Line | null;
        if (line && Math.abs(y - line.y) <= Math.max(line.size, size) * 0.5) {
          const gap = x - line.endX;
          if (gap > size * 0.12 && !line.text.endsWith(" ") && !item.str.startsWith(" ")) line.text += " ";
          line.text += item.str;
          line.endX = x + item.width;
          line.size = Math.max(line.size, size);
        } else {
          flush();
          current = { text: item.str, size, x, y, endX: x + item.width };
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

function bodySize(pages: { lines: Line[] }[]) {
  const weights = new Map<number, number>();
  for (const { lines } of pages)
    for (const l of lines) {
      const key = Math.round(l.size * 2) / 2;
      weights.set(key, (weights.get(key) ?? 0) + l.text.length);
    }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weights) if (w > bestWeight) [best, bestWeight] = [size, w];
  return best || 12;
}

function toBlocks(pages: { lines: Line[]; landscape: boolean }[]): Block[] {
  const skip = repeatedEdges(pages);
  const body = bodySize(pages);
  const slides = pages.filter((p) => p.landscape).length > pages.length / 2;
  const blocks: Block[] = [];

  pages.forEach(({ lines }, pageIndex) => {
    if (pageIndex > 0 && slides && blocks.length && blocks.at(-1)!.type !== "hr") blocks.push({ type: "hr", text: "", size: 0, x: 0, y: 0 });
    let prev: Block | null = null;
    lines.forEach((line, lineIndex) => {
      const isEdge = lineIndex < 2 || lineIndex >= lines.length - 2;
      if (PAGE_NUMBER.test(line.text) || (isEdge && skip.has(line.text.replace(/\d+/g, "#")))) return;

      const ratio = line.size / body;
      const bullet = BULLET.exec(line.text);
      const ordered = !bullet && ORDERED.exec(line.text);
      let block: Block;

      if (ratio >= 1.18 && line.text.length <= 140) {
        block = { type: ratio >= 1.55 ? "h2" : "h3", text: line.text, size: line.size, x: line.x, y: line.y };
        // Headings that wrap onto a second line of the same size continue the heading.
        if (prev && prev.type === block.type && Math.abs(prev.size - line.size) < 0.5 && prev.y - line.y <= line.size * 1.6) {
          prev.text += ` ${line.text}`;
          prev.y = line.y;
          return;
        }
      } else if (bullet && line.text.length > bullet[0].length) {
        block = { type: "ul", text: line.text.slice(bullet[0].length), size: line.size, x: line.x, y: line.y };
      } else if (ordered) {
        block = { type: "ol", text: line.text.slice(ordered[0].length), size: line.size, x: line.x, y: line.y };
      } else {
        const gap = prev ? prev.y - line.y : Infinity;
        const sameSize = prev ? Math.abs(prev.size - line.size) / body < 0.12 : false;
        const continues =
          prev &&
          (prev.type === "p" || prev.type === "ul" || prev.type === "ol") &&
          sameSize &&
          gap > 0 &&
          gap <= line.size * 1.75 &&
          // Wrapped bullet text sits to the right of the bullet.
          (prev.type === "p" || line.x > prev.x + line.size * 0.3);
        if (continues && prev) {
          if (/[a-z]-$/.test(prev.text) && /^[a-z]/.test(line.text)) prev.text = prev.text.slice(0, -1) + line.text;
          else prev.text += ` ${line.text}`;
          prev.y = line.y;
          return;
        }
        block = { type: "p", text: line.text, size: line.size, x: line.x, y: line.y };
      }
      blocks.push(block);
      prev = block;
    });
  });
  while (blocks.at(-1)?.type === "hr") blocks.pop();
  return blocks;
}

function blocksToHtml(blocks: Block[]) {
  let html = "";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "ul" || b.type === "ol") {
      html += `<${b.type}>`;
      while (i < blocks.length && blocks[i].type === b.type) html += `<li><p>${escapeHtml(blocks[i++].text)}</p></li>`;
      html += `</${b.type}>`;
      i--;
    } else if (b.type === "hr") {
      html += "<hr>";
    } else {
      html += `<${b.type}>${escapeHtml(b.text)}</${b.type}>`;
    }
  }
  return html;
}

/** Page count, searchable text, and an editable structured version of the PDF. */
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
