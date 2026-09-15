import { getStroke } from "perfect-freehand";

export type DrawTool = "pen" | "highlighter" | "eraser";
export type Paper = "blank" | "lines" | "grid";

/** Point: [x, y, pressure] in drawing units (the drawing is always 1000 units wide). */
export type StrokePoint = [number, number, number];

export interface Stroke {
  /** tool */
  t: "pen" | "highlighter";
  /** color (CSS value, usually a theme variable so ink stays readable in dark mode) */
  c: string;
  /** base size in drawing units */
  s: number;
  /** 1 when the points carry real stylus pressure */
  r?: 1;
  p: StrokePoint[];
}

export const DRAWING_WIDTH = 1000;
export const DEFAULT_HEIGHT = 480;
export const MIN_HEIGHT = 160;
export const MAX_HEIGHT = 8000;

export const PEN_COLORS = [
  { name: "Ink", value: "var(--ink)" },
  { name: "Blue", value: "var(--tc-blue)" },
  { name: "Red", value: "var(--tc-red)" },
  { name: "Green", value: "var(--tc-green)" },
  { name: "Orange", value: "var(--tc-orange)" },
  { name: "Purple", value: "var(--tc-purple)" },
] as const;

export const HIGHLIGHTER_COLORS = [
  { name: "Yellow", value: "var(--hl-yellow)" },
  { name: "Green", value: "var(--hl-green)" },
  { name: "Blue", value: "var(--hl-blue)" },
  { name: "Pink", value: "var(--hl-pink)" },
] as const;

export const PEN_SIZES = [
  { name: "Fine", value: 3.5 },
  { name: "Medium", value: 6 },
  { name: "Bold", value: 11 },
] as const;

export const HIGHLIGHTER_SIZES = [
  { name: "Thin", value: 16 },
  { name: "Medium", value: 26 },
  { name: "Wide", value: 42 },
] as const;

export function parseStrokes(json: unknown): Stroke[] {
  if (typeof json !== "string") return [];
  try {
    const data = JSON.parse(json);
    return Array.isArray(data)
      ? data.filter((s) => s && (s.t === "pen" || s.t === "highlighter") && typeof s.c === "string" && Array.isArray(s.p))
      : [];
  } catch {
    return [];
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

export function compactPoint(x: number, y: number, pressure: number): StrokePoint {
  return [round(x), round(y), Math.round(pressure * 100) / 100];
}

const average = (a: number, b: number) => (a + b) / 2;

/** SVG path for a filled freehand stroke outline. */
export function strokeToPath(stroke: Stroke): string {
  const highlighter = stroke.t === "highlighter";
  const outline = getStroke(stroke.p, {
    size: stroke.s,
    thinning: highlighter ? 0 : stroke.r ? 0.6 : 0.45,
    smoothing: 0.6,
    streamline: highlighter ? 0.6 : 0.4,
    simulatePressure: !stroke.r && !highlighter,
    last: true,
    start: { cap: true },
    end: { cap: true },
  });

  if (outline.length < 4) {
    // A tap: draw a dot.
    const [x, y] = stroke.p[0] ?? [0, 0];
    const r = stroke.s / 2;
    return `M${round(x - r)},${round(y)}a${round(r)},${round(r)} 0 1,0 ${round(r * 2)},0a${round(r)},${round(r)} 0 1,0 ${round(-r * 2)},0`;
  }

  let [a, b] = outline;
  const c = outline[2];
  let d = `M${round(a[0])},${round(a[1])}Q${round(b[0])},${round(b[1])} ${round(average(b[0], c[0]))},${round(average(b[1], c[1]))}T`;
  for (let i = 2; i < outline.length - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${round(average(a[0], b[0]))},${round(average(a[1], b[1]))} `;
  }
  return `${d}Z`;
}

export const strokeOpacity = (stroke: Pick<Stroke, "t">) => (stroke.t === "highlighter" ? 0.55 : 1);

/** Whether a point (in drawing units) touches a stroke — used by the eraser. */
export function hitsStroke(stroke: Stroke, x: number, y: number, radius: number) {
  const reach = radius + stroke.s / 2;
  const reach2 = reach * reach;
  const pts = stroke.p;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    if ((px - x) ** 2 + (py - y) ** 2 <= reach2) return true;
    const next = pts[i + 1];
    if (!next) continue;
    // Distance to the segment, so fast strokes with sparse points are still easy to erase.
    const dx = next[0] - px;
    const dy = next[1] - py;
    const len2 = dx * dx + dy * dy;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / len2));
    if ((px + t * dx - x) ** 2 + (py + t * dy - y) ** 2 <= reach2) return true;
  }
  return false;
}
