"use client";

import { Highlight } from "@tiptap/extension-highlight";
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionSync } from "./selection-sync";

export function createExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
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
  ];
}

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

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  if (!editor) {
    return (
      <div className={clsx("flex flex-col", className)}>
        <div className={clsx("h-[46px] border-b border-line", toolbarClassName)} />
        {header}
        <div className={clsx("rich", variant === "note" ? "rich-note" : "rich-sheet", contentClassName)} />
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col", className)}>
      <EditorToolbar editor={editor} className={toolbarClassName} onMenuToggle={setToolbarMenuOpen} />
      {header}
      <div
        className={clsx("flex-1 cursor-text", contentClassName)}
        onMouseDown={(e) => {
          // Clicking the empty area below the text focuses the end of the document.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <EditorBubbleMenu editor={editor} hidden={toolbarMenuOpen} />
      {footer?.(editor)}
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
