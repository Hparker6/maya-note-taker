"use client";

import { TextSelection } from "@tiptap/pm/state";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import clsx from "clsx";
import { Bold, Italic, Link2, Strikethrough, Underline } from "lucide-react";
import { useState } from "react";
import { LinkForm, ToolButton } from "./EditorToolbar";
import { HIGHLIGHTS, TEXT_COLORS, mod } from "./palette";

/** Quick formatting that appears above selected text. */
export function EditorBubbleMenu({ editor, hidden = false }: { editor: Editor; hidden?: boolean }) {
  const [linking, setLinking] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      highlightColor: e.isActive("highlight") ? ((e.getAttributes("highlight").color as string | undefined) ?? HIGHLIGHTS[0].value) : undefined,
      textColor: e.getAttributes("textStyle").color as string | undefined,
    }),
  });
  const chain = () => editor.chain().focus();
  const m = mod();

  return (
    <BubbleMenu
      editor={editor}
      // Only for selected text — never for a selected block like a sketch, whose own toolbar sits there.
      shouldShow={({ editor: e, state }) =>
        state.selection instanceof TextSelection && !state.selection.empty && e.isEditable && !e.isActive("codeBlock")
      }
      options={{ placement: "top", offset: 8, onHide: () => setLinking(false) }}
      className={clsx("z-40", hidden && "pointer-events-none invisible")}
    >
      <div
        className="flex animate-fade-in items-center gap-0.5 rounded-xl border border-line bg-card p-1 shadow-float"
        onMouseDown={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {linking ? (
          <div className="w-72">
            <LinkForm editor={editor} close={() => setLinking(false)} />
          </div>
        ) : (
          <>
            <ToolButton title={`Bold (${m}B)`} active={s.bold} onClick={() => chain().toggleBold().run()}>
              <Bold />
            </ToolButton>
            <ToolButton title={`Italic (${m}I)`} active={s.italic} onClick={() => chain().toggleItalic().run()}>
              <Italic />
            </ToolButton>
            <ToolButton title={`Underline (${m}U)`} active={s.underline} onClick={() => chain().toggleUnderline().run()}>
              <Underline />
            </ToolButton>
            <ToolButton title="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
              <Strikethrough />
            </ToolButton>
            <div className="mx-1 h-5 w-px bg-line" />
            {HIGHLIGHTS.slice(0, 4).map((h) => (
              <button
                key={h.name}
                type="button"
                title={`${h.name} highlight`}
                aria-label={`${h.name} highlight`}
                onClick={() =>
                  s.highlightColor === h.value
                    ? chain().unsetHighlight().run()
                    : chain().setHighlight({ color: h.value }).run()
                }
                className={clsx(
                  "mx-0.5 size-5 rounded-full border transition-transform hover:scale-110",
                  s.highlightColor === h.value ? "border-ink ring-2 ring-ink/15" : "border-black/10",
                )}
                style={{ background: h.value }}
              />
            ))}
            {TEXT_COLORS.slice(0, 2).map((c) => (
              <button
                key={c.name}
                type="button"
                title={`${c.name} text`}
                aria-label={`${c.name} text`}
                onClick={() => (s.textColor === c.value ? chain().unsetColor().run() : chain().setColor(c.value).run())}
                className={clsx(
                  "mx-0.5 grid size-6 place-items-center rounded-md text-[14px] font-bold hover:bg-hover",
                  s.textColor === c.value && "bg-hover",
                )}
                style={{ color: c.value }}
              >
                A
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-line" />
            <ToolButton title="Link" active={s.link} onClick={() => setLinking(true)}>
              <Link2 />
            </ToolButton>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
