"use client";

import clsx from "clsx";
import { Check, Eraser, Hand, Highlighter, Minus, PenLine, Plus, Redo2, Rows3, Undo2 } from "lucide-react";
import type { LineSpacing } from "@/lib/ink";
import { INK_HIGHLIGHTER_COLORS, INK_HIGHLIGHTER_SIZES, INK_PEN_COLORS, INK_PEN_SIZES, type InkPrefs } from "./useInk";

function Tool({
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
        "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-medium transition-colors disabled:opacity-35 [&_svg]:size-[19px]",
        active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 hidden h-7 w-px bg-line sm:block" />;

export function InkToolbar({
  title,
  prefs,
  setPrefs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoom,
  lineSpacing,
  onLineSpacing,
  fingerDraws,
  onFingerDraws,
  showFingerToggle,
  onDone,
}: {
  title: string;
  prefs: InkPrefs;
  setPrefs: (patch: Partial<InkPrefs>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  lineSpacing: LineSpacing;
  onLineSpacing: (value: LineSpacing) => void;
  fingerDraws: boolean;
  onFingerDraws: (value: boolean) => void;
  showFingerToggle: boolean;
  onDone: () => void;
}) {
  const highlighter = prefs.tool === "highlighter";
  const colors = highlighter ? INK_HIGHLIGHTER_COLORS : INK_PEN_COLORS;
  const sizes = highlighter ? INK_HIGHLIGHTER_SIZES : INK_PEN_SIZES;
  const color = highlighter ? prefs.hlColor : prefs.penColor;
  const size = highlighter ? prefs.hlSize : prefs.penSize;

  return (
    <div className="z-20 border-b border-line bg-card/95 px-2 py-1.5 backdrop-blur pt-[max(0.375rem,env(safe-area-inset-top))]" role="toolbar" aria-label="Pen tools">
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        <button
          type="button"
          title="Done drawing"
          aria-label="Done drawing"
          onClick={onDone}
          className="mr-1 inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-accent-ink transition-colors hover:bg-accent-hover [&_svg]:size-[18px]"
        >
          <Check /> Done
        </button>
        <span className="mr-1 hidden max-w-40 truncate text-sm font-medium text-ink-2 lg:inline">{title || "Untitled note"}</span>
        <Divider />

        <Tool label="Pen" active={prefs.tool === "pen"} onClick={() => setPrefs({ tool: "pen" })}>
          <PenLine />
        </Tool>
        <Tool label="Highlighter" active={highlighter} onClick={() => setPrefs({ tool: "highlighter" })}>
          <Highlighter />
        </Tool>
        <Tool label="Eraser" active={prefs.tool === "eraser"} onClick={() => setPrefs({ tool: "eraser" })}>
          <Eraser />
        </Tool>

        {prefs.tool !== "eraser" && (
          <>
            <Divider />
            <div className="flex items-center gap-1 px-1">
              {colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  aria-label={`${c.name} ${highlighter ? "highlighter" : "pen"}`}
                  aria-pressed={color === c.value}
                  onClick={() => setPrefs(highlighter ? { hlColor: c.value } : { penColor: c.value })}
                  className={clsx(
                    "size-7 rounded-full border-2 transition-transform hover:scale-110",
                    color === c.value ? "scale-110 border-ink shadow-[0_0_0_2px_var(--card)]" : "border-transparent",
                  )}
                  style={{ background: c.value }}
                />
              ))}
            </div>
            <Divider />
            {sizes.map((s, i) => (
              <Tool
                key={s.name}
                label={`${s.name} ${highlighter ? "highlighter" : "pen"}`}
                active={size === s.value}
                onClick={() => setPrefs(highlighter ? { hlSize: s.value } : { penSize: s.value })}
              >
                <span className="rounded-full bg-current" style={{ width: 6 + i * 5, height: highlighter ? 5 + i * 3 : 3 + i * 3 }} />
              </Tool>
            ))}
          </>
        )}

        <Divider />
        <Tool label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 />
        </Tool>
        <Tool label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 />
        </Tool>

        <Divider />
        <Tool label="Zoom out" onClick={() => onZoom(zoom / 1.25)} disabled={zoom <= 0.55}>
          <Minus />
        </Tool>
        <button
          type="button"
          onClick={() => onZoom(1)}
          title="Reset zoom"
          className="h-10 min-w-14 rounded-xl px-1 text-[13px] font-semibold text-ink-2 tabular-nums hover:bg-hover"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Tool label="Zoom in" onClick={() => onZoom(zoom * 1.25)} disabled={zoom >= 3.95}>
          <Plus />
        </Tool>

        <Divider />
        <Tool
          label={lineSpacing === "roomy" ? "Roomy lines (more space to write between lines)" : "Normal line spacing"}
          active={lineSpacing === "roomy"}
          onClick={() => onLineSpacing(lineSpacing === "roomy" ? "" : "roomy")}
        >
          <Rows3 /> <span className="hidden text-xs sm:inline">{lineSpacing === "roomy" ? "Roomy" : "Lines"}</span>
        </Tool>
        {showFingerToggle && (
          <Tool
            label={fingerDraws ? "Finger draws (tap so fingers scroll)" : "Finger scrolls (tap so fingers draw)"}
            active={fingerDraws}
            onClick={() => onFingerDraws(!fingerDraws)}
          >
            <Hand /> <span className="hidden text-xs sm:inline">{fingerDraws ? "Finger draws" : "Finger scrolls"}</span>
          </Tool>
        )}
      </div>
    </div>
  );
}
