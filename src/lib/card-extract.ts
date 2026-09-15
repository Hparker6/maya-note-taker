import "server-only";
import type { CardKind } from "./types";

// Finds flashcards in the student's notes without AI, from the structure people already use:
//   **Term**: definition        Term – definition        a ==highlighted== phrase in a sentence
//   a heading (or "…:" line) followed by a short list      two-column tables

export interface ExtractedCard {
  kind: CardKind;
  front: string;
  back: string;
}

interface Block {
  type: "heading" | "para" | "item" | "row";
  html: string;
  text: string;
  /** Items: the list they belong to. */
  listId?: number;
  /** Rows: cell texts, and whether the row is a header row. */
  cells?: string[];
  header?: boolean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", apos: "'" };

export function decode(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎" };

/** x<sup>2</sup> → x², H<sub>2</sub>O → H₂O (or x^(…) when there's no Unicode form), since cards are plain text. */
function scripts(html: string) {
  const convert = (inner: string, map: Record<string, string>, fallback: string) => {
    const text = decode(inner.replace(/<[^>]+>/g, ""));
    return [...text].every((c) => map[c]) ? [...text].map((c) => map[c]).join("") : `${fallback}(${text})`;
  };
  return html
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner: string) => convert(inner, SUP, "^"))
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner: string) => convert(inner, SUB, "_"));
}

const toText = (html: string) =>
  decode(scripts(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** Turns sanitized note HTML into flat text blocks with just enough structure for the rules below. */
function blocks(html: string): Block[] {
  const out: Block[] = [];
  const stack: string[] = [];
  const listIds: number[] = [];
  let nextList = 1;
  let buffer: string | null = null;
  let bufferKind: Block["type"] | null = null;
  let cells: string[] | null = null;
  let headerRow = false;
  let cellBuffer: string | null = null;
  let skipDepth = 0;

  const flush = () => {
    if (buffer !== null && bufferKind) {
      const text = toText(buffer);
      if (text) out.push({ type: bufferKind, html: buffer.trim(), text, listId: bufferKind === "item" ? listIds.at(-1) : undefined });
    }
    buffer = null;
    bufferKind = null;
  };

  const tokens = html.match(/<\/?[a-z][a-z0-9]*\b[^>]*>|[^<]+/gi) ?? [];
  for (const token of tokens) {
    const tag = token.match(/^<(\/?)([a-z][a-z0-9]*)/i);
    if (!tag) {
      if (skipDepth) continue;
      if (cellBuffer !== null) cellBuffer += token;
      else if (buffer !== null) buffer += token;
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag[2].toLowerCase();

    // Skip sketches and code blocks entirely.
    if (name === "svg" || name === "pre") {
      if (!closing && !token.endsWith("/>")) skipDepth++;
      else if (closing) skipDepth = Math.max(0, skipDepth - 1);
      continue;
    }
    if (skipDepth) continue;

    if (cellBuffer !== null && name !== "td" && name !== "th") {
      if (/^(strong|b|em|i|u|mark|s|sub|sup|code|span|a)$/.test(name)) cellBuffer += token;
      else if (name === "p" || name === "br") cellBuffer += " ";
      continue;
    }

    switch (name) {
      case "ul":
      case "ol":
        if (closing) listIds.pop();
        else {
          flush();
          listIds.push(nextList++);
        }
        break;
      case "li":
        if (closing) flush();
        else {
          flush();
          buffer = "";
          bufferKind = "item";
        }
        if (closing) stack.pop();
        else stack.push(name);
        break;
      case "p":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "blockquote":
        if (closing) {
          if (name !== "blockquote") flush();
        } else if (name !== "blockquote") {
          const inItem = stack.at(-1) === "li";
          if (inItem && buffer !== null && !toText(buffer)) {
            // First paragraph of a list item: keep collecting into the item.
          } else {
            flush();
            buffer = "";
            bufferKind = inItem ? "item" : name[0] === "h" ? "heading" : "para";
          }
        }
        break;
      case "tr":
        if (closing) {
          if (cells && cells.some(Boolean)) out.push({ type: "row", html: "", text: cells.join(" | "), cells, header: headerRow });
          cells = null;
        } else {
          flush();
          cells = [];
          headerRow = false;
        }
        break;
      case "td":
      case "th":
        if (closing) {
          if (cells && cellBuffer !== null) cells.push(toText(cellBuffer));
          cellBuffer = null;
        } else {
          if (name === "th") headerRow = true;
          cellBuffer = "";
        }
        break;
      case "br":
        if (buffer !== null) buffer += " ";
        break;
      default:
        if (buffer !== null && /^(strong|b|em|i|u|mark|s|sub|sup|code|span|a)$/.test(name)) buffer += token;
    }
  }
  flush();
  return out;
}

const words = (s: string) => (s ? s.split(/\s+/).length : 0);
// Only capitalize words ("net movement" → "Net movement"), never symbols or formulas ("s² = …", "p < α").
const capitalize = (s: string) => (/^[a-z][a-z ]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

const NOT_TERMS =
  /^(note|notes|example|examples|e\.?g|i\.?e|source|sources|page|pages|figure|fig|slide|table|objectives?|learning objectives?|agenda|outline|reading|readings|date|time|due|instructor|professor|email|office hours|location|room|question|answer|q|a|tip|reminder|warning|important|summary|overview|introduction|conclusion|references?|see|link|url|http|https|step \d+|part \d+|chapter \d+|lecture \d+|week \d+|unit \d+)$/i;

const VERB_LEAD = /^(is|are|was|were|refers to|means|describes|represents|involves|occurs when|happens when)\b/i;

function definitionCard(block: Block): ExtractedCard | null {
  const bold = block.html.match(/^\s*<(strong|b)>([\s\S]*?)<\/\1>([\s\S]*)$/i);
  if (bold) {
    const term = toText(bold[2]).replace(/[:：\s]+$/, "");
    const restRaw = toText(bold[3]);
    const sep = restRaw.match(/^[\s]*([:：=→]|[-–—](?=\s))\s*/);
    if (term && words(term) <= 10 && term.length <= 90 && !NOT_TERMS.test(term)) {
      if (sep) {
        const def = restRaw.slice(sep[0].length).trim();
        if (def && def.toLowerCase() !== term.toLowerCase()) return { kind: "basic", front: term, back: capitalize(def) };
      } else if (/[:：]$/.test(toText(bold[2])) && restRaw) {
        return { kind: "basic", front: term, back: capitalize(restRaw) };
      } else if (VERB_LEAD.test(restRaw) && words(restRaw) >= 3) {
        return { kind: "basic", front: term, back: `${term} ${restRaw}` };
      }
    }
  }

  const text = block.text;
  const colon = text.match(/^([^:.!?]{2,70}):\s+(.{2,})$/);
  const dash = text.match(/^(.{2,70}?)\s+[–—-]\s+(.{3,})$/);
  const m = colon ?? dash;
  if (m) {
    const term = m[1].trim();
    const def = m[2].trim();
    const termWords = words(term);
    // A sentence before the colon ("The three stages are: …") isn't a term.
    if (termWords <= 6 && !NOT_TERMS.test(term) && !/\b(are|is|include|includes|following|these|below)$/i.test(term) && def.toLowerCase() !== term.toLowerCase())
      return { kind: "basic", front: term, back: capitalize(def) };
  }
  return null;
}

function sentenceAround(text: string, phrase: string) {
  if (text.length <= 260) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.find((s) => s.includes(phrase)) ?? text;
}

function clozeCards(block: Block, skipTerm?: string): ExtractedCard[] {
  const cards: ExtractedCard[] = [];
  for (const m of block.html.matchAll(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi)) {
    const phrase = toText(m[1]);
    if (!phrase || phrase.length > 70 || words(phrase) > 8) continue;
    if (skipTerm && phrase.toLowerCase() === skipTerm.toLowerCase()) continue;
    const sentence = sentenceAround(block.text, phrase);
    if (sentence.length < phrase.length + 15 || words(sentence) < 5) continue;
    const idx = sentence.indexOf(phrase);
    if (idx < 0) continue;
    cards.push({ kind: "cloze", front: `${sentence.slice(0, idx)}_____${sentence.slice(idx + phrase.length)}`, back: phrase });
  }
  return cards;
}

/** Extracts cards from one note or sheet. */
export function extractCards(html: string): ExtractedCard[] {
  const list = blocks(html);
  const cards: ExtractedCard[] = [];
  let header: string[] | null = null;

  for (let i = 0; i < list.length; i++) {
    const block = list[i];

    if (block.type === "row") {
      const cells = block.cells ?? [];
      if (block.header) {
        header = cells;
        continue;
      }
      const [first, ...rest] = cells;
      const filled = rest.filter(Boolean);
      if (first && filled.length && first.length <= 90 && words(first) <= 10) {
        const back =
          rest.length === 1
            ? rest[0]
            : rest
                .map((c, ci) => (c ? (header?.[ci + 1] ? `${header[ci + 1]}: ${c}` : c) : ""))
                .filter(Boolean)
                .join("\n");
        if (back) cards.push({ kind: "basic", front: header?.[0] && rest.length > 1 ? `${first} (${header[0]})` : first, back });
      }
      continue;
    }
    header = null;

    // Heading or "…:" line followed by a short list of short items.
    const introducesList = block.type === "heading" || (block.type === "para" && /:\s*$/.test(block.text));
    if (introducesList && list[i + 1]?.type === "item") {
      const listId = list[i + 1].listId;
      const items: Block[] = [];
      for (let j = i + 1; j < list.length && list[j].type === "item" && list[j].listId === listId; j++) items.push(list[j]);
      const short = items.every((it) => words(it.text) <= 10 && !definitionCard(it));
      const title = block.text.replace(/:\s*$/, "");
      if (short && items.length >= 2 && items.length <= 8 && title.length <= 90 && words(title) >= 1 && !NOT_TERMS.test(title)) {
        cards.push({ kind: "list", front: title, back: items.map((it) => it.text).join("\n") });
      }
    }

    if (block.type === "heading") continue;
    const def = definitionCard(block);
    // A definition line already makes a card; a blank in the same line would just repeat it.
    if (def) cards.push(def);
    else cards.push(...clozeCards(block));
  }

  return cards
    .map((c) => ({
      ...c,
      // Study-sheet markers (★ from her notes, ⚠ disagreements) aren't part of the fact.
      front: clip(c.front.replace(/^[★⚠\s]+/, "").trim(), 300),
      back: clip(c.back.replace(/\s*\(from my notes\)\s*$/i, "").replace(/^[★⚠\s]+/, "").trim(), 700),
    }))
    .filter((c) => c.front && c.back);
}

/** Cards with the same key are duplicates. */
export const dedupeKey = (front: string) =>
  front
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
