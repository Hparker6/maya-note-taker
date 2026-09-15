"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import clsx from "clsx";
import {
  Check,
  Eraser,
  GripHorizontal,
  Hand,
  Highlighter,
  PenLine,
  Plus,
  Redo2,
  StickyNote,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocalStorage } from "@/lib/useStorage";
import {
  compactPoint,
  DRAWING_WIDTH,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_SIZES,
  hitsStroke,
  MAX_HEIGHT,
  MIN_HEIGHT,
  parseStrokes,
  PEN_COLORS,
  PEN_SIZES,
  strokeOpacity,
  strokeToPath,
  type DrawTool,
  type Paper,
  type Stroke,
} from "./strokes";

interface Prefs {
  tool: DrawTool;
  penColor: string;
  penSize: number;
  hlColor: string;
  hlSize: number;
}

const DEFAULT_PREFS: Prefs = {
  tool: "pen",
  penColor: PEN_COLORS[0].value,
  penSize: PEN_SIZES[1].value,
  hlColor: HIGHLIGHTER_COLORS[0].value,
  hlSize: HIGHLIGHTER_SIZES[1].value,
};

const ERASER_RADIUS = 10;
const PAPERS: { value: Paper; label: string }[] = [
  { value: "lines", label: "Lined" },
  { value: "grid", label: "Grid" },
  { value: "blank", label: "Blank" },
];

// Once an Apple Pencil (or any stylus) is seen, fingers scroll instead of drawing.
let stylusSeen = false;

/** Ids of sketches currently open for drawing; kept outside React so re-renders can't close them. */
export const activeDrawings = new Set<string>();

function paperStyle(paper: Paper, unitPx: number): CSSProperties {
  const gap = 32 * unitPx;
  const line = "color-mix(in oklab, var(--line-strong) 70%, transparent)";
  if (paper === "lines") return { backgroundImage: `linear-gradient(to bottom, transparent ${gap - 1}px, ${line} ${gap - 1}px)`, backgroundSize: `100% ${gap}px` };
  if (paper === "grid")
    return {
      backgroundImage: `linear-gradient(to bottom, transparent ${gap - 1}px, ${line} ${gap - 1}px), linear-gradient(to right, transparent ${gap - 1}px, ${line} ${gap - 1}px)`,
      backgroundSize: `${gap}px ${gap}px`,
    };
  return {};
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
  disabled,
  className,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-medium transition-colors disabled:opacity-35 [&_svg]:size-[18px]",
        active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-6 w-px bg-line" />;

export function DrawingView({ node, updateAttributes, deleteNode, editor }: ReactNodeViewProps) {
  const strokes = useMemo(() => parseStrokes(node.attrs.strokes), [node.attrs.strokes]);
  const height = Number(node.attrs.height);
  const paper = node.attrs.paper as Paper;

  const [storedPrefs, setStoredPrefs] = useLocalStorage("drawing:prefs");
  const prefs: Prefs = useMemo(() => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(storedPrefs ?? "{}") };
    } catch {
      return DEFAULT_PREFS;
    }
  }, [storedPrefs]);
  const setPrefs = (patch: Partial<Prefs>) => setStoredPrefs(JSON.stringify({ ...prefs, ...patch }));

  const drawingId = node.attrs.id as string | null;
  const [active, setActiveState] = useState(() => (drawingId ? activeDrawings.has(drawingId) : strokes.length === 0));
  const setActive = (value: boolean) => {
    if (drawingId) {
      if (value) activeDrawings.add(drawingId);
      else activeDrawings.delete(drawingId);
    }
    setActiveState(value);
  };
  const [fingerDraws, setFingerDraws] = useState(!stylusSeen);
  const [live, setLive] = useState<Stroke | null>(null);
  const [erasing, setErasing] = useState<Stroke[] | null>(null);
  const [history, setHistory] = useState<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const [width, setWidth] = useState(0);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [coarse, setCoarse] = useState(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; stroke?: Stroke; working?: Stroke[] } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    return () => observer.disconnect();
  }, []);

  const unitPx = width ? width / DRAWING_WIDTH : 0.75;
  const shownHeight = dragHeight ?? height;
  const editable = editor.isEditable;

  const commit = useCallback(
    (next: Stroke[]) => {
      setHistory((h) => ({ undo: [...h.undo.slice(-60), node.attrs.strokes as string], redo: [] }));
      updateAttributes({ strokes: JSON.stringify(next) });
    },
    [node.attrs.strokes, updateAttributes],
  );

  const undo = () => {
    const previous = history.undo.at(-1);
    if (previous === undefined) return;
    setHistory((h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, node.attrs.strokes as string] }));
    updateAttributes({ strokes: previous });
  };
  const redo = () => {
    const next = history.redo.at(-1);
    if (next === undefined) return;
    setHistory((h) => ({ undo: [...h.undo, node.attrs.strokes as string], redo: h.redo.slice(0, -1) }));
    updateAttributes({ strokes: next });
  };

  const toPoint = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const scale = DRAWING_WIDTH / rect.width;
    const pressure = e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5;
    return compactPoint((e.clientX - rect.left) * scale, (e.clientY - rect.top) * scale, pressure);
  };

  const eraseAt = (x: number, y: number) => {
    const g = gesture.current;
    if (!g?.working) return;
    const remaining = g.working.filter((s) => !hitsStroke(s, x, y, ERASER_RADIUS));
    if (remaining.length !== g.working.length) {
      g.working = remaining;
      setErasing(remaining);
    }
  };

  // Apple Pencil drags would scroll the page in Safari; fingers keep scrolling unless finger drawing is on.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || !editable) return;
    const block = (e: TouchEvent) => {
      const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus");
      if (stylus || (active && fingerDraws) || gesture.current) e.preventDefault();
    };
    el.addEventListener("touchstart", block, { passive: false });
    el.addEventListener("touchmove", block, { passive: false });
    return () => {
      el.removeEventListener("touchstart", block);
      el.removeEventListener("touchmove", block);
    };
  }, [active, fingerDraws, editable]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || e.button > 0 || gesture.current) return;
    const pen = e.pointerType === "pen";
    if (pen && !stylusSeen) {
      stylusSeen = true;
      setFingerDraws(false);
    }
    if (e.pointerType === "touch" && !(active && fingerDraws)) return;
    if (e.pointerType === "mouse" && !active) {
      setActive(true);
      return;
    }
    if (!active) setActive(true);
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = toPoint(e);
    if (prefs.tool === "eraser") {
      gesture.current = { id: e.pointerId, working: strokes };
      setErasing(strokes);
      eraseAt(point[0], point[1]);
      return;
    }
    const highlighter = prefs.tool === "highlighter";
    const stroke: Stroke = {
      t: highlighter ? "highlighter" : "pen",
      c: highlighter ? prefs.hlColor : prefs.penColor,
      s: highlighter ? prefs.hlSize : prefs.penSize,
      ...(pen && e.pressure > 0 && !highlighter ? { r: 1 as const } : {}),
      p: [point],
    };
    gesture.current = { id: e.pointerId, stroke };
    setLive(stroke);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    e.preventDefault();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const samples = events.length ? events : [e.nativeEvent];
    if (g.working) {
      for (const sample of samples) {
        const [x, y] = toPoint(sample);
        eraseAt(x, y);
      }
      return;
    }
    if (!g.stroke) return;
    for (const sample of samples) g.stroke.p.push(toPoint(sample));
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (gesture.current?.stroke) setLive({ ...gesture.current.stroke });
      });
    }
  };

  const endGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (g.working) {
      if (g.working.length !== strokes.length) commit(g.working);
      setErasing(null);
    } else if (g.stroke) {
      commit([...strokes, g.stroke]);
      setLive(null);
    }
  };

  const startResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startHeight = height;
    const scale = DRAWING_WIDTH / (surfaceRef.current?.getBoundingClientRect().width || DRAWING_WIDTH);
    let latest = startHeight;
    const move = (ev: PointerEvent) => {
      latest = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + (ev.clientY - startY) * scale)));
      setDragHeight(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setDragHeight(null);
      if (latest !== startHeight) updateAttributes({ height: latest });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const shown = erasing ?? strokes;
  const paths = useMemo(() => shown.map((s) => ({ d: strokeToPath(s), c: s.c, o: strokeOpacity(s) })), [shown]);
  const livePath = live ? strokeToPath(live) : null;
  const colors = prefs.tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const sizes = prefs.tool === "highlighter" ? HIGHLIGHTER_SIZES : PEN_SIZES;
  const currentColor = prefs.tool === "highlighter" ? prefs.hlColor : prefs.penColor;
  const currentSize = prefs.tool === "highlighter" ? prefs.hlSize : prefs.penSize;

  return (
    <NodeViewWrapper className="drawing-node my-4" data-drawing-active={active || undefined}>
      {active && editable && (
        <div
          className="sticky top-2 z-20 mx-auto mb-2 flex w-fit max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-line bg-card/95 p-1 shadow-float backdrop-blur"
          role="toolbar"
          aria-label="Drawing tools"
        >
          <ToolbarButton label="Pen" active={prefs.tool === "pen"} onClick={() => setPrefs({ tool: "pen" })}>
            <PenLine /> <span className="hidden sm:inline">Pen</span>
          </ToolbarButton>
          <ToolbarButton label="Highlighter" active={prefs.tool === "highlighter"} onClick={() => setPrefs({ tool: "highlighter" })}>
            <Highlighter /> <span className="hidden sm:inline">Highlight</span>
          </ToolbarButton>
          <ToolbarButton label="Eraser" active={prefs.tool === "eraser"} onClick={() => setPrefs({ tool: "eraser" })}>
            <Eraser /> <span className="hidden sm:inline">Erase</span>
          </ToolbarButton>

          {prefs.tool !== "eraser" && (
            <>
              <Divider />
              <div className="flex items-center gap-1 px-1">
                {colors.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    title={color.name}
                    aria-label={`${color.name} ${prefs.tool}`}
                    onClick={() => setPrefs(prefs.tool === "highlighter" ? { hlColor: color.value } : { penColor: color.value })}
                    className={clsx(
                      "size-7 rounded-full border-2 transition-transform hover:scale-110",
                      currentColor === color.value ? "scale-110 border-ink shadow-[0_0_0_2px_var(--card)]" : "border-transparent",
                    )}
                    style={{ background: color.value }}
                  />
                ))}
              </div>
              <Divider />
              <div className="flex items-center gap-0.5">
                {sizes.map((size, i) => (
                  <ToolbarButton
                    key={size.name}
                    label={`${size.name} ${prefs.tool === "highlighter" ? "highlighter" : "pen"}`}
                    active={currentSize === size.value}
                    onClick={() => setPrefs(prefs.tool === "highlighter" ? { hlSize: size.value } : { penSize: size.value })}
                  >
                    <span className="rounded-full bg-current" style={{ width: 6 + i * 5, height: prefs.tool === "highlighter" ? 5 + i * 3 : 4 + i * 4 }} />
                  </ToolbarButton>
                ))}
              </div>
            </>
          )}

          <Divider />
          <ToolbarButton label="Undo" onClick={undo} disabled={!history.undo.length}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={redo} disabled={!history.redo.length}>
            <Redo2 />
          </ToolbarButton>
          <ToolbarButton
            label={`Paper: ${PAPERS.find((p) => p.value === paper)?.label}`}
            onClick={() => updateAttributes({ paper: PAPERS[(PAPERS.findIndex((p) => p.value === paper) + 1) % PAPERS.length].value })}
          >
            <StickyNote /> <span className="hidden text-xs sm:inline">{PAPERS.find((p) => p.value === paper)?.label}</span>
          </ToolbarButton>
          {coarse && (
            <ToolbarButton
              label={fingerDraws ? "Finger draws (tap to scroll with finger)" : "Finger scrolls (tap to draw with finger)"}
              active={fingerDraws}
              onClick={() => setFingerDraws((v) => !v)}
            >
              <Hand /> <span className="text-xs">{fingerDraws ? "Finger draws" : "Finger scrolls"}</span>
            </ToolbarButton>
          )}
          <ToolbarButton label="Delete sketch" onClick={() => deleteNode()} className="hover:bg-danger-soft hover:text-danger">
            <Trash2 />
          </ToolbarButton>
          <ToolbarButton label="Done drawing" onClick={() => setActive(false)} className="bg-accent text-accent-ink hover:bg-accent-hover hover:text-accent-ink">
            <Check /> Done
          </ToolbarButton>
        </div>
      )}

      <div
        className={clsx(
          "group/drawing relative overflow-hidden rounded-xl border bg-card transition-colors",
          active ? "border-accent/50 shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_14%,transparent)]" : "border-line hover:border-line-strong",
        )}
      >
        <div
          ref={surfaceRef}
          className={clsx("relative w-full select-none", active && editable ? (prefs.tool === "eraser" ? "cursor-cell" : "cursor-crosshair") : "cursor-pointer")}
          style={{
            height: shownHeight * unitPx,
            touchAction: active && fingerDraws ? "none" : "pan-x pan-y",
            ...paperStyle(paper, unitPx),
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onDoubleClick={() => editable && setActive(true)}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${DRAWING_WIDTH} ${shownHeight}`}
            preserveAspectRatio="xMinYMin meet"
            aria-label="Sketch"
            role="img"
          >
            {paths.map((p, i) => (
              <path key={i} d={p.d} style={{ fill: p.c, fillOpacity: p.o }} />
            ))}
            {livePath && live && <path d={livePath} style={{ fill: live.c, fillOpacity: strokeOpacity(live) }} />}
          </svg>

          {!active && editable && (
            <button
              type="button"
              onClick={() => setActive(true)}
              className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card/95 px-2.5 py-1.5 text-[13px] font-medium text-ink-2 opacity-0 shadow-[var(--shadow-sm)] transition-opacity group-hover/drawing:opacity-100 hover:text-ink focus:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <PenLine className="size-4" /> {strokes.length ? "Edit sketch" : "Draw"}
            </button>
          )}
          {!strokes.length && !live && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-3">
              <span>
                <PenLine className="mx-auto mb-2 size-5 opacity-60" />
                {active ? "Draw here with your Apple Pencil, finger, or mouse" : "Empty sketch — tap Draw"}
              </span>
            </div>
          )}
        </div>

        {active && editable && (
          <div className="flex items-center justify-center gap-2 border-t border-line bg-paper/60 py-1">
            <button
              type="button"
              onPointerDown={startResize}
              className="inline-flex cursor-ns-resize touch-none items-center gap-1.5 rounded-lg px-3 py-1 text-xs text-ink-3 hover:bg-hover hover:text-ink"
              aria-label="Drag to resize the sketch"
            >
              <GripHorizontal className="size-4" /> Drag to resize
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ height: Math.min(MAX_HEIGHT, height + 400) })}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs text-ink-3 hover:bg-hover hover:text-ink"
            >
              <Plus className="size-3.5" /> More space
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
