// Handwriting drawn directly on a note page. Client-safe: used by the editor and to validate saves.
//
// Coordinates are in page units: the page is always PAGE_WIDTH units wide, whatever its size on
// screen. Each stroke is anchored to the text block it was drawn next to (`a`, the block's
// data-bid) and its y values are relative to that block's top, so ink moves with its text when
// lines are added or removed above it. `ay` remembers where the block was, in case it's deleted.

export const PAGE_WIDTH = 760;

export type InkPoint = [number, number, number];

export interface InkStroke {
  t: "pen" | "highlighter";
  /** CSS color, usually a theme variable so ink stays readable in dark mode. */
  c: string;
  /** Base size in page units. */
  s: number;
  /** 1 when points carry real stylus pressure. */
  r?: 1;
  p: InkPoint[];
  /** Anchor block id. */
  a?: string;
  /** The anchor's top when the stroke was drawn. */
  ay?: number;
}

export type LineSpacing = "" | "roomy";

const COLOR = /^(var\(--[\w-]+\)|#[0-9a-f]{3,8})$/i;
const ANCHOR = /^[\w-]{1,40}$/;
const MAX_STROKES = 20_000;
const MAX_POINTS = 600_000;

const finite = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

export function parseInk(json: string | null | undefined): InkStroke[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json) as { strokes?: unknown };
    return Array.isArray(data?.strokes) ? (data.strokes as InkStroke[]) : [];
  } catch {
    return [];
  }
}

export const serializeInk = (strokes: InkStroke[]) => (strokes.length ? JSON.stringify({ v: 1, strokes }) : "");

/** Validates and normalizes ink sent by a client. Throws with a message on anything malformed. */
export function sanitizeInk(raw: unknown): string {
  if (raw === "" || raw === null) return "";
  if (typeof raw !== "string") throw new Error("ink must be JSON text.");
  let data: { strokes?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("ink is not valid JSON.");
  }
  if (!Array.isArray(data?.strokes)) throw new Error("ink.strokes must be a list.");
  if (data.strokes.length > MAX_STROKES) throw new Error("Too much ink on one note.");
  let points = 0;
  const strokes: InkStroke[] = data.strokes.map((value) => {
    const s = value as Record<string, unknown>;
    if (s?.t !== "pen" && s?.t !== "highlighter") throw new Error("Unknown ink tool.");
    if (typeof s.c !== "string" || !COLOR.test(s.c)) throw new Error("Invalid ink color.");
    if (!finite(s.s, 0.5, 120)) throw new Error("Invalid ink size.");
    if (!Array.isArray(s.p) || !s.p.length) throw new Error("Ink stroke has no points.");
    points += s.p.length;
    if (points > MAX_POINTS) throw new Error("Too much ink on one note.");
    const p = s.p.map((pt) => {
      if (!Array.isArray(pt) || !finite(pt[0], -5_000, 50_000) || !finite(pt[1], -1_000_000, 1_000_000) || !finite(pt[2], 0, 1)) throw new Error("Invalid ink point.");
      return [pt[0], pt[1], pt[2]] as InkPoint;
    });
    const stroke: InkStroke = { t: s.t, c: s.c, s: s.s, p };
    if (s.r === 1) stroke.r = 1;
    if (s.a !== undefined) {
      if (typeof s.a !== "string" || !ANCHOR.test(s.a)) throw new Error("Invalid ink anchor.");
      stroke.a = s.a;
    }
    if (s.ay !== undefined) {
      if (!finite(s.ay, -1_000_000, 1_000_000)) throw new Error("Invalid ink anchor position.");
      stroke.ay = s.ay;
    }
    return stroke;
  });
  return serializeInk(strokes);
}

export const newBlockId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
