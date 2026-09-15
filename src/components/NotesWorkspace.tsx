"use client";

import clsx from "clsx";
import { ChevronLeft, FileText, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { NoteRow } from "@/lib/types";
import { useAutosave } from "@/lib/useAutosave";
import { RichEditor, WordCount } from "./editor/RichEditor";
import { RelativeTime } from "./RelativeTime";
import { SaveIndicator } from "./SaveIndicator";
import { Button } from "./ui/Button";
import { useFeedback } from "./ui/feedback";

function snippet(html: string) {
  return html
    .replace(/<\/(p|h\d|li)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
}

export function NotesWorkspace({
  unitId,
  documentId,
  notes: initialNotes,
  initialNoteId,
  documentTitles = {},
  compact = false,
}: {
  unitId: number;
  documentId?: number;
  notes: NoteRow[];
  initialNoteId?: number;
  documentTitles?: Record<number, string>;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [notes, setNotesState] = useState(initialNotes);
  // Mirror of `notes` so autosave always sees the latest title + content together.
  const notesRef = useRef(initialNotes);
  const setNotes = useCallback((update: (list: NoteRow[]) => NoteRow[]) => {
    notesRef.current = update(notesRef.current);
    setNotesState(notesRef.current);
  }, []);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialNoteId && initialNotes.some((n) => n.id === initialNoteId) ? initialNoteId : compact ? (initialNotes[0]?.id ?? null) : null,
  );
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialNoteId));
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const selected = notes.find((n) => n.id === selectedId) ?? (compact ? null : notes[0]) ?? null;

  const saver = useAutosave(async (note: { id: number; title: string; content: string }) => {
    const res = await api<{ updated_at: string }>(`/api/notes/${note.id}`, {
      method: "PATCH",
      json: { title: note.title, content: note.content },
    });
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, updated_at: res.updated_at } : n)));
  });

  const { schedule } = saver;
  const patchLocal = useCallback(
    (id: number, patch: Partial<NoteRow>) => {
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;
      const merged = { ...current, ...patch };
      setNotes((list) => list.map((n) => (n.id === id ? merged : n)));
      schedule({ id, title: merged.title, content: merged.content });
    },
    [schedule, setNotes],
  );

  const select = async (id: number) => {
    await saver.flush();
    setSelectedId(id);
    setMobileEditor(true);
  };

  const create = async () => {
    setCreating(true);
    try {
      await saver.flush();
      const note = await api<NoteRow>("/api/notes", {
        json: { unit_id: unitId, document_id: documentId ?? null, title: "", content: "" },
      });
      setNotes((list) => [note, ...list]);
      setSelectedId(note.id);
      setMobileEditor(true);
      setTimeout(() => titleRef.current?.focus(), 60);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't create note", "error");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (note: NoteRow) => {
    const ok = await confirm({
      title: "Delete this note?",
      message: `"${note.title || "Untitled note"}" will be permanently deleted.`,
      confirmLabel: "Delete note",
      danger: true,
    });
    if (!ok) return;
    await saver.flush();
    await api(`/api/notes/${note.id}`, { method: "DELETE" });
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setSelectedId(null);
    setMobileEditor(false);
    toast("Note deleted");
    router.refresh();
  };

  if (!notes.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-sunken text-ink-2">
          <NotebookPen className="size-6" />
        </div>
        <h3 className="font-serif text-2xl font-semibold tracking-tight">
          {documentId ? "Take notes on this PDF" : "Your notes, your words"}
        </h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-3">
          Bold, highlight, color, lists, checklists and tables — everything you&apos;d expect. Your highlights tell Claude
          what matters when it builds the study sheet.
        </p>
        <Button variant="primary" size="lg" className="mt-6" onClick={create} disabled={creating}>
          <Plus /> New note
        </Button>
      </div>
    );
  }

  const editor = selected && (
    <div key={selected.id} className="flex min-h-0 flex-1 flex-col">
      <RichEditor
        content={selected.content}
        autofocus={false}
        onUpdate={(html) => patchLocal(selected.id, { content: html })}
        className="min-h-0 flex-1"
        toolbarClassName={clsx("sticky top-0 z-10", compact ? "px-3" : "px-4 sm:px-8")}
        contentClassName={clsx("overflow-y-auto pb-16", compact ? "px-5" : "px-6 sm:px-10")}
        header={
          <div className={clsx("pt-6 pb-2", compact ? "px-5" : "px-6 sm:px-10")}>
            {!compact && (
              <button
                onClick={() => setMobileEditor(false)}
                className="mb-3 flex items-center gap-1 text-sm text-ink-3 hover:text-ink md:hidden"
              >
                <ChevronLeft className="size-4" /> All notes
              </button>
            )}
            <input
              ref={titleRef}
              value={selected.title}
              placeholder="Untitled note"
              maxLength={200}
              onChange={(e) => patchLocal(selected.id, { title: e.target.value })}
              className="w-full bg-transparent font-serif text-[28px] leading-tight font-semibold tracking-tight text-ink placeholder:text-ink-3/60 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              {selected.document_id && documentTitles[selected.document_id] && !documentId && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3" /> {documentTitles[selected.document_id]}
                </span>
              )}
              <RelativeTime iso={selected.updated_at} prefix="Edited " />
              <SaveIndicator status={saver.status} onRetry={() => void saver.flush()} />
            </div>
          </div>
        }
        footer={(ed) => (
          <div
            className={clsx(
              "flex items-center justify-between border-t border-line py-2 text-xs text-ink-3",
              compact ? "px-5" : "px-6 sm:px-10",
            )}
          >
            <WordCount editor={ed} />
            <button onClick={() => remove(selected)} className="flex items-center gap-1.5 hover:text-danger">
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        )}
      />
    </div>
  );

  const list = (
    <div className="flex flex-col gap-0.5 p-2">
      {notes.map((n) => (
        <button
          key={n.id}
          onClick={() => select(n.id)}
          className={clsx(
            "group rounded-lg px-3 py-2.5 text-left transition-colors",
            selected?.id === n.id ? "bg-card shadow-[var(--shadow-sm)] ring-1 ring-line" : "hover:bg-hover",
          )}
        >
          <div className="truncate text-[14px] font-medium text-ink">{n.title || "Untitled note"}</div>
          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{snippet(n.content) || "Empty note"}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-3">
            <RelativeTime iso={n.updated_at} />
            {n.document_id && documentTitles[n.document_id] && !documentId && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{documentTitles[n.document_id]}</span>
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-2">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => select(n.id)}
              className={clsx(
                "max-w-[180px] shrink-0 truncate rounded-full px-3 py-1 text-[13px] transition-colors",
                selected?.id === n.id ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover",
              )}
            >
              {n.title || "Untitled note"}
            </button>
          ))}
          <Button size="icon-sm" variant="ghost" onClick={create} disabled={creating} title="New note" className="shrink-0">
            <Plus />
          </Button>
        </div>
        {editor ?? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-3">Pick a note above or create a new one.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={clsx(
          "w-full shrink-0 flex-col border-r border-line bg-sunken/60 md:flex md:w-72",
          mobileEditor ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <span className="text-xs font-semibold tracking-wider text-ink-3 uppercase">
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" variant="primary" onClick={create} disabled={creating}>
            <Plus /> New
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      </aside>
      <section className={clsx("min-w-0 flex-1 flex-col bg-card md:flex", mobileEditor ? "flex" : "hidden")}>{editor}</section>
    </div>
  );
}
