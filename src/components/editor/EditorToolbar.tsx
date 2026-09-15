"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import clsx from "clsx";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Code2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { HIGHLIGHTS, TEXT_COLORS, mod } from "./palette";

export function ToolButton({
  onClick,
  active,
  disabled,
  title,
  children,
  className,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md px-1.5 text-ink-2 transition-colors disabled:opacity-35 [&_svg]:size-[17px]",
        active ? "bg-accent-soft text-accent" : "hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-line" />;
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="ml-auto text-[11px] text-ink-3">{children}</span>;
}

// Lets the editor hide its selection bubble while a toolbar dropdown is open.
const MenuToggleContext = createContext<(open: boolean) => void>(() => {});

function Popover({
  button,
  children,
  title,
  active,
  width = "w-56",
  align = "start",
}: {
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  title: string;
  active?: boolean;
  width?: string;
  align?: "start" | "end";
}) {
  const [open, setOpenState] = useState(false);
  const onMenuToggle = useContext(MenuToggleContext);
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) =>
      setOpenState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (value !== prev) queueMicrotask(() => onMenuToggle(value));
        return value;
      }),
    [onMenuToggle],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={ref} className="relative">
      <ToolButton title={title} active={active || open} onClick={() => setOpen((o) => !o)}>
        {button}
      </ToolButton>
      {open && (
        <div
          className={clsx(
            "absolute top-full z-30 mt-1.5 animate-fade-in rounded-xl border border-line bg-card p-1.5 shadow-float",
            align === "end" ? "right-0" : "left-0",
            width,
          )}
          onMouseDown={(e) => {
            if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  onClick,
  children,
  active,
  danger,
}: {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] transition-colors [&_svg]:size-4",
        danger
          ? "text-danger hover:bg-danger-soft"
          : active
            ? "bg-accent-soft text-accent"
            : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Swatches({
  colors,
  current,
  onPick,
  onClear,
  kind,
}: {
  colors: readonly { name: string; value: string }[];
  current?: string;
  onPick: (value: string) => void;
  onClear: () => void;
  kind: "highlight" | "text";
}) {
  return (
    <div className="flex items-center gap-1">
      {colors.map((c) => (
        <button
          key={c.name}
          type="button"
          title={c.name}
          aria-label={`${c.name} ${kind === "highlight" ? "highlight" : "text"}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c.value)}
          className={clsx(
            "grid size-7 place-items-center rounded-md border transition-transform hover:scale-110",
            current === c.value ? "border-ink" : "border-line",
          )}
          style={kind === "highlight" ? { background: c.value } : undefined}
        >
          {kind === "text" && (
            <span className="text-[15px] font-bold" style={{ color: c.value }}>
              A
            </span>
          )}
        </button>
      ))}
      <button
        type="button"
        title="Remove"
        aria-label="Remove color"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        className="grid size-7 place-items-center rounded-md border border-line text-ink-3 hover:bg-hover hover:text-ink"
      >
        <RemoveFormatting className="size-3.5" />
      </button>
    </div>
  );
}

export function LinkForm({ editor, close }: { editor: Editor; close: () => void }) {
  const [href, setHref] = useState<string>(editor.getAttributes("link").href ?? "");
  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else {
      const normalized = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
      if (editor.state.selection.empty && !editor.isActive("link")) {
        chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: normalized } }] }).run();
      } else chain.setLink({ href: normalized }).run();
    }
    close();
  };
  return (
    <form
      className="flex items-center gap-1.5 p-0.5"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input
        autoFocus
        value={href}
        onChange={(e) => setHref(e.target.value)}
        placeholder="Paste a link…"
        className="h-8 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
      <button type="submit" className="h-8 rounded-md bg-accent px-2.5 text-[13px] font-medium text-accent-ink">
        Apply
      </button>
    </form>
  );
}

const BLOCKS = [
  { label: "Normal text", level: 0, className: "text-sm" },
  { label: "Heading 1", level: 1, className: "font-serif text-xl font-semibold" },
  { label: "Heading 2", level: 2, className: "font-serif text-lg font-semibold" },
  { label: "Heading 3", level: 3, className: "font-serif text-base font-semibold" },
] as const;

export function EditorToolbar({
  editor,
  className,
  onMenuToggle = () => {},
}: {
  editor: Editor;
  className?: string;
  onMenuToggle?: (open: boolean) => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      highlightColor: e.getAttributes("highlight").color as string | undefined,
      textColor: e.getAttributes("textStyle").color as string | undefined,
      heading: ([1, 2, 3] as const).find((level) => e.isActive("heading", { level })) ?? 0,
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      sub: e.isActive("subscript"),
      sup: e.isActive("superscript"),
      align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const m = mod();
  const block = BLOCKS.find((b) => b.level === s.heading) ?? BLOCKS[0];
  const AlignIcon = s.align === "center" ? AlignCenter : s.align === "right" ? AlignRight : AlignLeft;

  return (
    <MenuToggleContext.Provider value={onMenuToggle}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className={clsx(
          "flex flex-wrap items-center gap-0.5 border-b border-line bg-card/95 px-2 py-1.5 backdrop-blur",
          className,
        )}
      >
        <ToolButton title={`Undo (${m}Z)`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 />
        </ToolButton>
        <ToolButton title={`Redo (${m}Shift+Z)`} disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 />
        </ToolButton>
        <Divider />

        <Popover
          title="Text style"
          width="w-48"
          button={
            <span className="flex w-[104px] items-center justify-between px-1 text-[13px] font-medium">
              {block.label}
              <ChevronDown className="!size-3.5 opacity-60" />
            </span>
          }
        >
          {(close) =>
            BLOCKS.map((b) => (
              <MenuRow
                key={b.level}
                active={b.level === s.heading}
                onClick={() => {
                  if (b.level === 0) chain().setParagraph().run();
                  else chain().toggleHeading({ level: b.level }).run();
                  close();
                }}
              >
                <span className={b.className}>{b.label}</span>
              </MenuRow>
            ))
          }
        </Popover>
        <Divider />

        <ToolButton title={`Bold (${m}B)`} active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold />
        </ToolButton>
        <ToolButton title={`Italic (${m}I)`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic />
        </ToolButton>
        <ToolButton title={`Underline (${m}U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline />
        </ToolButton>
        <ToolButton title={`Strikethrough (${m}Shift+S)`} active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough />
        </ToolButton>

        <div className="flex items-center">
          <ToolButton
            title={`Highlight (${m}Shift+H)`}
            active={s.highlight}
            className="rounded-r-none pr-1"
            onClick={() =>
              chain()
                .toggleHighlight({ color: s.highlightColor ?? HIGHLIGHTS[0].value })
                .run()
            }
          >
            <span className="relative">
              <Highlighter />
              <span
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full"
                style={{ background: s.highlightColor ?? HIGHLIGHTS[0].value }}
              />
            </span>
          </ToolButton>
          <Popover title="Highlight color" width="w-auto" button={<ChevronDown className="!size-3" />}>
            {(close) => (
              <Swatches
                kind="highlight"
                colors={HIGHLIGHTS}
                current={s.highlightColor}
                onPick={(color) => {
                  chain().setHighlight({ color }).run();
                  close();
                }}
                onClear={() => {
                  chain().unsetHighlight().run();
                  close();
                }}
              />
            )}
          </Popover>
        </div>

        <Popover
          title="Text color"
          width="w-auto"
          active={Boolean(s.textColor)}
          button={
            <span className="relative">
              <Baseline />
              <span
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full"
                style={{ background: s.textColor ?? "var(--ink)" }}
              />
            </span>
          }
        >
          {(close) => (
            <Swatches
              kind="text"
              colors={TEXT_COLORS}
              current={s.textColor}
              onPick={(color) => {
                chain().setColor(color).run();
                close();
              }}
              onClear={() => {
                chain().unsetColor().run();
                close();
              }}
            />
          )}
        </Popover>
        <Divider />

        <ToolButton title={`Bulleted list (${m}Shift+8)`} active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List />
        </ToolButton>
        <ToolButton title={`Numbered list (${m}Shift+7)`} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered />
        </ToolButton>
        <ToolButton title={`Checklist (${m}Shift+9)`} active={s.task} onClick={() => chain().toggleTaskList().run()}>
          <ListChecks />
        </ToolButton>

        <Popover title="Alignment" width="w-40" button={<AlignIcon />}>
          {(close) =>
            (
              [
                ["left", "Left", AlignLeft],
                ["center", "Center", AlignCenter],
                ["right", "Right", AlignRight],
              ] as const
            ).map(([value, label, Icon]) => (
              <MenuRow
                key={value}
                active={s.align === value}
                onClick={() => {
                  chain().setTextAlign(value).run();
                  close();
                }}
              >
                <Icon /> {label}
              </MenuRow>
            ))
          }
        </Popover>
        <Divider />

        <ToolButton title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote />
        </ToolButton>
        <Popover title="Link" width="w-72" active={s.link} button={<Link2 />}>
          {(close) => <LinkForm editor={editor} close={close} />}
        </Popover>

        <Popover title="Table" width="w-52" align="end" active={s.table} button={<Table2 />}>
          {(close) => {
            const run = (fn: () => void) => () => {
              fn();
              close();
            };
            return s.table ? (
              <>
                <MenuRow onClick={run(() => chain().addRowAfter().run())}>Add row below</MenuRow>
                <MenuRow onClick={run(() => chain().addColumnAfter().run())}>Add column right</MenuRow>
                <MenuRow onClick={run(() => chain().toggleHeaderRow().run())}>Toggle header row</MenuRow>
                <MenuRow onClick={run(() => chain().deleteRow().run())}>Delete row</MenuRow>
                <MenuRow onClick={run(() => chain().deleteColumn().run())}>Delete column</MenuRow>
                <div className="my-1 h-px bg-line" />
                <MenuRow danger onClick={run(() => chain().deleteTable().run())}>
                  Delete table
                </MenuRow>
              </>
            ) : (
              <MenuRow onClick={run(() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
                <Table2 /> Insert 3 × 3 table
              </MenuRow>
            );
          }}
        </Popover>
        <Popover
          title="More formatting"
          width="w-56"
          align="end"
          active={s.sub || s.sup || s.codeBlock}
          button={<MoreHorizontal />}
        >
          {(close) => {
            const run = (fn: () => void) => () => {
              fn();
              close();
            };
            return (
              <>
                <MenuRow active={s.sub} onClick={run(() => chain().toggleSubscript().run())}>
                  <SubIcon /> Subscript <Kbd>{m},</Kbd>
                </MenuRow>
                <MenuRow active={s.sup} onClick={run(() => chain().toggleSuperscript().run())}>
                  <SupIcon /> Superscript <Kbd>{m}.</Kbd>
                </MenuRow>
                <MenuRow active={s.codeBlock} onClick={run(() => chain().toggleCodeBlock().run())}>
                  <Code2 /> Code block
                </MenuRow>
                <MenuRow onClick={run(() => chain().setHorizontalRule().run())}>
                  <Minus /> Divider line
                </MenuRow>
                <div className="my-1 h-px bg-line" />
                <MenuRow onClick={run(() => chain().unsetAllMarks().clearNodes().run())}>
                  <RemoveFormatting /> Clear formatting
                </MenuRow>
              </>
            );
          }}
        </Popover>
      </div>
    </MenuToggleContext.Provider>
  );
}
