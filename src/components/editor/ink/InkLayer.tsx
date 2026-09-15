"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { newBlockId, PAGE_WIDTH, type InkPoint, type InkStroke } from "@/lib/ink";
import { hitsStroke, strokeOpacity, strokeToPath } from "../drawing/strokes";
import type { InkPrefs } from "./useInk";

const ERASER_RADIUS = 8;
const pathCache = new WeakMap<InkStroke, string>();
const pathFor = (stroke: InkStroke) => {
  let d = pathCache.get(stroke);
  if (d === undefined) {
    d = strokeToPath(stroke);
    pathCache.set(stroke, d);
  }
  return d;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Layout {
  /** Screen pixels per page unit (includes any zoom transform). */
  scale: number;
  /** CSS pixels per page unit inside the page, before any zoom transform. */
  localScale: number;
  /** Page height in page units. */
  height: number;
  /** Anchor id → block top, in page units. */
  anchors: Map<string, number>;
}

/**
 * A block's reference line: the top of its first line of text (so line spacing and margins can
 * change without moving ink off its words), or the element's top when it has no text.
 */
function referenceTop(dom: HTMLElement): number {
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const text = walker.nextNode();
  if (text) {
    const range = document.createRange();
    const start = text.nodeValue!.search(/\S/);
    range.setStart(text, start);
    range.setEnd(text, start + 1);
    const rect = range.getClientRects()[0];
    if (rect) return rect.top;
  }
  return dom.getBoundingClientRect().top;
}

/** Where each anchored block currently sits. Walks the document so node views (sketches) work too. */
function measure(editor: Editor, page: HTMLElement): Layout {
  const rect = page.getBoundingClientRect();
  const scale = rect.width / PAGE_WIDTH || 1;
  const anchors = new Map<string, number>();
  if (!editor.isDestroyed) {
    editor.state.doc.descendants((node, pos) => {
      const bid = node.attrs.bid as string | null | undefined;
      if (bid) {
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) anchors.set(bid, (referenceTop(dom) - rect.top) / scale);
      }
      return node.type.name !== "table";
    });
  }
  return { scale, localScale: page.offsetWidth / PAGE_WIDTH || 1, height: rect.height / scale, anchors };
}

const offsetOf = (stroke: InkStroke, anchors: Map<string, number>) => (stroke.a ? (anchors.get(stroke.a) ?? stroke.ay ?? 0) : 0);

/** Anchors a just-drawn stroke (absolute page coordinates) to the text block it's drawn on or next to. */
function anchorStroke(editor: Editor, page: HTMLElement, stroke: InkStroke): InkStroke {
  const ys = stroke.p.map((pt) => pt[1]);
  const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rect = page.getBoundingClientRect();
  const scale = rect.width / PAGE_WIDTH || 1;
  const blocks: { pos: number; top: number; bottom: number; ref: number; bid: string | null }[] = [];
  editor.state.doc.descendants((node, pos) => {
    const candidate = node.isTextblock || node.type.name === "table" || (node.isAtom && node.isBlock);
    if (!candidate) return true;
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const box = dom.getBoundingClientRect();
      blocks.push({
        pos,
        top: (box.top - rect.top) / scale,
        bottom: (box.bottom - rect.top) / scale,
        ref: (referenceTop(dom) - rect.top) / scale,
        bid: (node.attrs.bid as string | null) ?? null,
      });
    }
    return false;
  });
  // The block whose box is closest to the stroke's vertical middle: a circle around a heading
  // belongs to the heading, an underline to the line above it.
  const distance = (b: (typeof blocks)[number]) => (middle < b.top ? b.top - middle : middle > b.bottom ? middle - b.bottom : 0);
  const anchor = blocks.reduce<(typeof blocks)[number] | undefined>((best, b) => (!best || distance(b) < distance(best) ? b : best), undefined);
  if (!anchor) return stroke;

  let bid = anchor.bid;
  if (!bid) {
    bid = newBlockId();
    // Not an undoable text edit: it only gives the block an id to anchor to.
    editor.view.dispatch(editor.state.tr.setNodeAttribute(anchor.pos, "bid", bid).setMeta("addToHistory", false));
  }
  return {
    ...stroke,
    a: bid,
    ay: round1(anchor.ref),
    p: stroke.p.map(([x, y, pressure]) => [x, round1(y - anchor.ref), pressure] as InkPoint),
  };
}

// Once an Apple Pencil is seen, fingers scroll and zoom instead of drawing.
let stylusSeen = false;
export const hasSeenStylus = () => stylusSeen;

export function InkLayer({
  editor,
  pageRef,
  strokes,
  commit,
  prefs,
  penMode,
  fingerDraws,
  onStylus,
}: {
  editor: Editor;
  pageRef: RefObject<HTMLDivElement | null>;
  strokes: InkStroke[];
  commit: (next: InkStroke[]) => void;
  prefs: InkPrefs;
  penMode: boolean;
  fingerDraws: boolean;
  onStylus: () => void;
}) {
  const [layout, setLayout] = useState<Layout>({ scale: 1, localScale: 1, height: 0, anchors: new Map() });
  const [live, setLive] = useState<InkStroke | null>(null);
  const [erasing, setErasing] = useState<InkStroke[] | null>(null);
  const layoutRef = useRef(layout);
  const latest = useRef({ strokes, commit, prefs, penMode, fingerDraws, onStylus });
  const gesture = useRef<{ id: number; stroke?: InkStroke; working?: InkStroke[] } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    latest.current = { strokes, commit, prefs, penMode, fingerDraws, onStylus };
  });

  // Keep block positions current as text changes, the window resizes, or zoom changes.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = measure(editor, page);
        layoutRef.current = next;
        setLayout(next);
      });
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(page);
    editor.on("update", schedule);
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      editor.off("update", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, pageRef, strokes, penMode]);

  // Pointer input on the page. Capture phase, so a pen stroke never moves the text cursor.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const toPage = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): InkPoint => {
      const rect = page.getBoundingClientRect();
      const scale = rect.width / PAGE_WIDTH || 1;
      const pressure = e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5;
      return [round1((e.clientX - rect.left) / scale), round1((e.clientY - rect.top) / scale), Math.round(pressure * 100) / 100];
    };

    const eraseAt = ([x, y]: InkPoint) => {
      const g = gesture.current;
      if (!g?.working) return;
      const anchors = layoutRef.current.anchors;
      const remaining = g.working.filter((s) => !hitsStroke(s, x, y - offsetOf(s, anchors), ERASER_RADIUS));
      if (remaining.length !== g.working.length) {
        g.working = remaining;
        setErasing(remaining);
      }
    };

    const onDown = (e: PointerEvent) => {
      const L = latest.current;
      if (gesture.current || e.button > 0) return;
      const pen = e.pointerType === "pen";
      if (pen && !stylusSeen) {
        stylusSeen = true;
        L.onStylus();
      }
      // Outside pen mode, a pencil on a sketch box draws in that sketch instead.
      const inSketch = e.target instanceof Element && Boolean(e.target.closest(".drawing-node"));
      const inks = L.penMode ? e.pointerType !== "touch" || L.fingerDraws : pen && L.prefs.pencilAnywhere && !inSketch;
      if (!inks) return;
      e.preventDefault();
      e.stopPropagation();
      page.setPointerCapture(e.pointerId);
      const point = toPage(e);
      if (L.prefs.tool === "eraser") {
        gesture.current = { id: e.pointerId, working: L.strokes };
        setErasing(L.strokes);
        eraseAt(point);
        return;
      }
      const highlighter = L.prefs.tool === "highlighter";
      const stroke: InkStroke = {
        t: highlighter ? "highlighter" : "pen",
        c: highlighter ? L.prefs.hlColor : L.prefs.penColor,
        s: highlighter ? L.prefs.hlSize : L.prefs.penSize,
        ...(pen && e.pressure > 0 && !highlighter ? { r: 1 as const } : {}),
        p: [point],
      };
      gesture.current = { id: e.pointerId, stroke };
      setLive(stroke);
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      e.preventDefault();
      const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const samples = coalesced.length ? coalesced : [e];
      if (g.working) {
        for (const sample of samples) eraseAt(toPage(sample));
        return;
      }
      if (!g.stroke) return;
      for (const sample of samples) g.stroke.p.push(toPage(sample));
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (gesture.current?.stroke) setLive({ ...gesture.current.stroke });
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      gesture.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const L = latest.current;
      if (g.working) {
        if (g.working.length !== L.strokes.length) L.commit(g.working);
        setErasing(null);
      } else if (g.stroke) {
        L.commit([...L.strokes, anchorStroke(editor, page, g.stroke)]);
        setLive(null);
      }
    };

    // Safari scrolls on stylus drags unless the touch is cancelled; fingers keep scrolling.
    const onTouch = (e: TouchEvent) => {
      const L = latest.current;
      const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus");
      if ((stylus && (L.penMode || L.prefs.pencilAnywhere)) || (L.penMode && L.fingerDraws && e.touches.length === 1) || gesture.current) e.preventDefault();
    };

    page.addEventListener("pointerdown", onDown, true);
    page.addEventListener("pointermove", onMove);
    page.addEventListener("pointerup", onUp);
    page.addEventListener("pointercancel", onUp);
    page.addEventListener("touchstart", onTouch, { passive: false });
    page.addEventListener("touchmove", onTouch, { passive: false });
    return () => {
      page.removeEventListener("pointerdown", onDown, true);
      page.removeEventListener("pointermove", onMove);
      page.removeEventListener("pointerup", onUp);
      page.removeEventListener("pointercancel", onUp);
      page.removeEventListener("touchstart", onTouch);
      page.removeEventListener("touchmove", onTouch);
      cancelAnimationFrame(frame.current);
    };
  }, [editor, pageRef]);

  const shown = erasing ?? strokes;
  const bottom = useMemo(() => {
    let max = 0;
    for (const s of shown) {
      const offset = offsetOf(s, layout.anchors);
      for (const pt of s.p) max = Math.max(max, pt[1] + offset + s.s);
    }
    return max;
  }, [shown, layout]);
  const height = Math.max(layout.height, bottom + 24, 1);

  if (!shown.length && !live) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 z-10 w-full overflow-visible"
      style={{ height: height * layout.localScale }}
      viewBox={`0 0 ${PAGE_WIDTH} ${height}`}
      preserveAspectRatio="xMinYMin meet"
      aria-label="Handwriting"
      role="img"
      data-ink-layer=""
    >
      {shown.map((s, i) => (
        <path key={i} d={pathFor(s)} transform={`translate(0 ${round1(offsetOf(s, layout.anchors))})`} style={{ fill: s.c, fillOpacity: strokeOpacity(s) }} />
      ))}
      {live && <path d={strokeToPath(live)} style={{ fill: live.c, fillOpacity: strokeOpacity(live) }} />}
    </svg>
  );
}
