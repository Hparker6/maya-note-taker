"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseInk, serializeInk, type InkStroke } from "@/lib/ink";
import { useLocalStorage } from "@/lib/useStorage";
import type { DrawTool } from "../drawing/strokes";

export const INK_PEN_COLORS = [
  { name: "Ink", value: "var(--ink)" },
  { name: "Blue", value: "var(--tc-blue)" },
  { name: "Red", value: "var(--tc-red)" },
  { name: "Green", value: "var(--tc-green)" },
  { name: "Orange", value: "var(--tc-orange)" },
  { name: "Purple", value: "var(--tc-purple)" },
] as const;

export const INK_HIGHLIGHTER_COLORS = [
  { name: "Yellow", value: "var(--hl-yellow)" },
  { name: "Green", value: "var(--hl-green)" },
  { name: "Blue", value: "var(--hl-blue)" },
  { name: "Pink", value: "var(--hl-pink)" },
] as const;

// Page units: a 760-unit page shows text at ~15.5px, so these read like a fine / medium / bold pen.
export const INK_PEN_SIZES = [
  { name: "Fine", value: 2 },
  { name: "Medium", value: 3.2 },
  { name: "Bold", value: 5.5 },
] as const;

export const INK_HIGHLIGHTER_SIZES = [
  { name: "Thin", value: 12 },
  { name: "Medium", value: 20 },
  { name: "Wide", value: 30 },
] as const;

export interface InkPrefs {
  tool: DrawTool;
  penColor: string;
  penSize: number;
  hlColor: string;
  hlSize: number;
  /** Apple Pencil (or any stylus) writes on the page even outside pen mode. */
  pencilAnywhere: boolean;
}

const DEFAULT_PREFS: InkPrefs = {
  tool: "pen",
  penColor: INK_PEN_COLORS[0].value,
  penSize: INK_PEN_SIZES[1].value,
  hlColor: INK_HIGHLIGHTER_COLORS[0].value,
  hlSize: INK_HIGHLIGHTER_SIZES[1].value,
  pencilAnywhere: true,
};

export function useInkPrefs() {
  const [stored, setStored] = useLocalStorage("ink:prefs");
  const prefs = useMemo<InkPrefs>(() => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(stored ?? "{}") };
    } catch {
      return DEFAULT_PREFS;
    }
  }, [stored]);
  const setPrefs = useCallback((patch: Partial<InkPrefs>) => setStored(JSON.stringify({ ...prefs, ...patch })), [prefs, setStored]);
  return [prefs, setPrefs] as const;
}

/** Strokes on a page, with undo/redo. Every change is reported as serialized JSON. */
export function useInk(initial: string, onChange: (json: string) => void) {
  const [strokes, setStrokes] = useState<InkStroke[]>(() => parseInk(initial));
  const [history, setHistoryState] = useState<{ undo: InkStroke[][]; redo: InkStroke[][] }>({ undo: [], redo: [] });
  const strokesRef = useRef(strokes);
  const historyRef = useRef(history);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const setHistory = useCallback((next: { undo: InkStroke[][]; redo: InkStroke[][] }) => {
    historyRef.current = next;
    setHistoryState(next);
  }, []);

  const apply = useCallback((next: InkStroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    onChangeRef.current(serializeInk(next));
  }, []);

  const commit = useCallback(
    (next: InkStroke[]) => {
      setHistory({ undo: [...historyRef.current.undo.slice(-100), strokesRef.current], redo: [] });
      apply(next);
    },
    [apply, setHistory],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    const previous = h.undo.at(-1);
    if (!previous) return;
    setHistory({ undo: h.undo.slice(0, -1), redo: [...h.redo, strokesRef.current] });
    apply(previous);
  }, [apply, setHistory]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.redo.at(-1);
    if (!next) return;
    setHistory({ undo: [...h.undo, strokesRef.current], redo: h.redo.slice(0, -1) });
    apply(next);
  }, [apply, setHistory]);

  return { strokes, strokesRef, commit, undo, redo, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 };
}
