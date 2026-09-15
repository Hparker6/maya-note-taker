"use client";

import { Extension } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Selection } from "@tiptap/pm/state";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Typography } from "@tiptap/extension-typography";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PAGE_WIDTH, type LineSpacing } from "@/lib/ink";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { BlockIds } from "./BlockIds";
import { Drawing } from "./drawing/DrawingExtension";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { EditorToolbar } from "./EditorToolbar";
import { hasSeenStylus, InkLayer } from "./ink/InkLayer";
import { InkToolbar } from "./ink/InkToolbar";
import { useInk, useInkPrefs } from "./ink/useInk";
import { SelectionSync } from "./selection-sync";

const exitTopHandlers = new WeakMap<Editor, () => void>();

/** Arrow-up from the very start of the document hands focus back (e.g. to a title field). */
const ExitTop = Extension.create({
  name: "exitTop",
  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => {
        const handler = exitTopHandlers.get(editor as Editor);
        if (!handler) return false;
        // Read the caret the browser really has (see SelectionSync) before deciding.
        (editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
        const { selection, doc } = editor.state;
        if (!selection.empty || selection.from !== Selection.atStart(doc).from) return false;
        handler();
        return true;
      },
    };
  },
});

export function createExtensions(placeholder: string) {
  return [
    ExitTop,
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Subscript,
    Superscript,
    Typography,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    SelectionSync,
    Drawing,
    BlockIds,
  ];
}

/** Handwriting on the page: the note's ink plus how to save it. */
export interface InkBinding {
  value: string;
  lineSpacing: string;
  onChange: (json: string) => void;
  onLineSpacingChange: (value: LineSpacing) => void;
  penMode: boolean;
  onPenModeChange: (on: boolean) => void;
  title: string;
  /** Shown in the pen toolbar, where the note's own save status is out of sight. */
  saveIndicator?: ReactNode;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

export function RichEditor({
  content,
  onUpdate,
  placeholder = "Start typing… use the toolbar or shortcuts like Ctrl+B, and ==text== to highlight.",
  variant = "note",
  autofocus = false,
  header,
  footer,
  className,
  contentClassName,
  toolbarClassName,
  onReady,
  onExitTop,
  ink,
}: {
  content: string;
  onUpdate?: (html: string) => void;
  placeholder?: string;
  variant?: "note" | "sheet";
  autofocus?: boolean;
  header?: ReactNode;
  footer?: (editor: Editor) => ReactNode;
  className?: string;
  contentClassName?: string;
  toolbarClassName?: string;
  onReady?: (editor: Editor) => void;
  /** Called on Arrow-up at the start of the document. */
  onExitTop?: () => void;
  /** Enables drawing directly on the page (notes). */
  ink?: InkBinding;
}) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // useEditor re-applies options whenever they differ by identity, so everything passed
  // to it must be stable. Content is only the *initial* document; the editor owns it after.
  const [options] = useState(() => ({
    extensions: createExtensions(placeholder),
    content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    autofocus: autofocus ? ("end" as const) : false,
    editorProps: {
      attributes: {
        class: clsx("rich min-h-[240px] focus:outline-none", variant === "note" ? "rich-note" : "rich-sheet"),
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => onUpdateRef.current?.(editor.getHTML()),
  }));
  const editor = useEditor(options);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);

  // ── handwriting ──
  const noopChange = useCallback(() => {}, []);
  const inkState = useInk(ink?.value ?? "", ink?.onChange ?? noopChange);
  const [prefs, setPrefs] = useInkPrefs();
  const coarse = useMediaQuery("(pointer: coarse)");
  const [fingerDraws, setFingerDraws] = useState(() => !hasSeenStylus());
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const penMode = Boolean(ink?.penMode);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    if (onExitTop) exitTopHandlers.set(editor, onExitTop);
    else exitTopHandlers.delete(editor);
  }, [editor, onExitTop]);

  // Text isn't editable while drawing, so the pencil never opens the keyboard. No update event: nothing changed.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!penMode, false);
  }, [editor, penMode]);

  const setZoom = useCallback((next: number, focus?: { x: number; y: number }) => {
    const el = scrollRef.current;
    const z = clampZoom(next);
    const previous = zoomRef.current;
    if (!el || z === previous) return;
    const rect = el.getBoundingClientRect();
    const fx = (focus?.x ?? rect.left + rect.width / 2) - rect.left;
    const fy = (focus?.y ?? rect.top + rect.height / 2) - rect.top;
    const left = (el.scrollLeft + fx) * (z / previous) - fx;
    const top = (el.scrollTop + fy) * (z / previous) - fy;
    zoomRef.current = z;
    setZoomState(z);
    requestAnimationFrame(() => {
      el.scrollLeft = left;
      el.scrollTop = top;
    });
  }, []);

  // Leaving pen mode returns to normal size.
  const [zoomedFor, setZoomedFor] = useState(penMode);
  if (zoomedFor !== penMode) {
    setZoomedFor(penMode);
    if (!penMode) setZoomState(1);
  }
  useEffect(() => {
    if (!penMode) zoomRef.current = 1;
  }, [penMode]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const page = pageRef.current;
    if (!ink || !scroller || !page) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(scroller.clientWidth);
      setPageHeight(page.offsetHeight);
    });
    observer.observe(scroller);
    observer.observe(page);
    return () => observer.disconnect();
  }, [ink, editor]);

  // Two-finger pinch (and trackpad pinch / Ctrl+wheel) zooms while drawing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !penMode) return;
    let pinch: { distance: number; zoom: number } | null = null;
    const fingers = (e: TouchEvent) => Array.from(e.touches).filter((t) => (t as Touch & { touchType?: string }).touchType !== "stylus");
    const spread = (touches: Touch[]) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onStart = (e: TouchEvent) => {
      const f = fingers(e);
      if (f.length === 2) {
        pinch = { distance: spread(f) || 1, zoom: zoomRef.current };
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      const f = fingers(e);
      if (!pinch || f.length < 2) return;
      e.preventDefault();
      setZoom(pinch.zoom * (spread(f) / pinch.distance), { x: (f[0].clientX + f[1].clientX) / 2, y: (f[0].clientY + f[1].clientY) / 2 });
    };
    const onEnd = (e: TouchEvent) => {
      if (fingers(e).length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [penMode, setZoom]);

  // Esc finishes drawing.
  useEffect(() => {
    if (!penMode || !ink) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ink.onPenModeChange(false);
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) inkState.redo();
        else inkState.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [penMode, ink, inkState]);

  if (!editor) {
    return (
      <div className={clsx("flex flex-col", className)}>
        <div className={clsx("h-[46px] border-b border-line", toolbarClassName)} />
        {header}
        <div className={clsx("rich", variant === "note" ? "rich-note" : "rich-sheet", contentClassName)} />
      </div>
    );
  }

  // Pages with handwriting keep one fixed layout width (scaled to fit), so ink lines up with the
  // same text everywhere. Plain notes stay fluid; phones always reflow.
  const hasInk = inkState.strokes.length > 0;
  const fixedPage = Boolean(ink) && (hasInk || penMode) && containerWidth >= 480;
  const fit = fixedPage && containerWidth < PAGE_WIDTH ? containerWidth / PAGE_WIDTH : 1;
  const scale = fixedPage ? fit * (penMode ? zoom : 1) : 1;
  const transformed = fixedPage && scale !== 1;
  const pageStyle: CSSProperties = fixedPage ? { width: PAGE_WIDTH, ...(transformed ? { transform: `scale(${scale})`, transformOrigin: "0 0" } : {}) } : {};
  const sizerStyle: CSSProperties | undefined = transformed ? { width: PAGE_WIDTH * scale, height: pageHeight * scale, margin: "0 auto" } : undefined;

  const page = (
    <div
      ref={pageRef}
      data-spacing={ink?.lineSpacing || undefined}
      data-pen={penMode || undefined}
      className={clsx(
        "ink-page relative",
        ink ? (fixedPage ? "mx-auto px-12" : "mx-auto w-full max-w-[760px] px-6 sm:px-12") : undefined,
        penMode && "cursor-crosshair pt-10 pb-[55vh]",
      )}
      style={pageStyle}
    >
      <EditorContent editor={editor} />
      {ink && (
        <InkLayer
          editor={editor}
          pageRef={pageRef}
          strokes={inkState.strokes}
          commit={inkState.commit}
          prefs={prefs}
          penMode={penMode}
          fingerDraws={fingerDraws}
          onStylus={() => setFingerDraws(false)}
        />
      )}
    </div>
  );

  return (
    <div className={clsx("flex flex-col", className)}>
      {penMode && ink ? (
        <InkToolbar
          title={ink.title}
          prefs={prefs}
          setPrefs={setPrefs}
          canUndo={inkState.canUndo}
          canRedo={inkState.canRedo}
          onUndo={inkState.undo}
          onRedo={inkState.redo}
          zoom={zoom}
          onZoom={(z) => setZoom(z)}
          lineSpacing={(ink.lineSpacing as LineSpacing) || ""}
          onLineSpacing={ink.onLineSpacingChange}
          fingerDraws={fingerDraws}
          onFingerDraws={setFingerDraws}
          showFingerToggle={coarse}
          onDone={() => ink.onPenModeChange(false)}
          saveIndicator={ink.saveIndicator}
        />
      ) : (
        <EditorToolbar
          editor={editor}
          className={toolbarClassName}
          onMenuToggle={setToolbarMenuOpen}
          onDraw={ink ? () => ink.onPenModeChange(true) : undefined}
        />
      )}
      {!penMode && header}
      <div
        ref={scrollRef}
        className={clsx("flex-1", penMode ? "overflow-auto bg-sunken/50 overscroll-contain" : "cursor-text", contentClassName)}
        onMouseDown={(e) => {
          // Clicking the empty area below the text focuses the end of the document.
          if (!penMode && (e.target === e.currentTarget || e.target === pageRef.current)) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        {sizerStyle ? <div style={sizerStyle}>{page}</div> : page}
      </div>
      {!penMode && <EditorBubbleMenu editor={editor} hidden={toolbarMenuOpen} />}
      {!penMode && footer?.(editor)}
    </div>
  );
}

export function WordCount({ editor }: { editor: Editor }) {
  const words = useEditorState({ editor, selector: ({ editor }) => editor.storage.characterCount.words() as number });
  return (
    <span>
      {words.toLocaleString()} word{words === 1 ? "" : "s"}
    </span>
  );
}
