"use client";

import { Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import clsx from "clsx";
import DOMPurify from "dompurify";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Download,
  FileSearch,
  FileText,
  FileType2,
  Printer,
  RefreshCw,
  Share2,
  FolderInput,
  MoreHorizontal,
  NotebookPen,
  PanelLeft,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { consumeJobStream } from "@/lib/job-client";
import { markdownToHtml } from "@/lib/markdown";
import { editNoteInk, editNoteText, flushNote, flushNotes, forgetNote, onNoteSyncEvent, seedNotes, useNoteSyncState } from "@/lib/note-sync";
import type { JobStatus, NoteRow, WorkspaceDocument } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useHydrated } from "@/lib/useStorage";
import { RichEditor, WordCount } from "./editor/RichEditor";
import { MoveDocumentDialog } from "./MoveDocumentDialog";
import { RelativeTime } from "./RelativeTime";
import { SaveIndicator } from "./SaveIndicator";
import { SheetPanel } from "./SheetPanel";
import { useShell } from "./shell/ShellContext";
import { Button, buttonClass, Spinner } from "./ui/Button";
import { useFeedback } from "./ui/feedback";
import { Menu } from "./ui/Menu";

export type SidePanel = "pdf" | "sheet" | null;

const TRANSCRIBE_LABEL: Record<JobStatus, string> = {
  queued: "Waiting for other AI work to finish…",
  reading: "AI is reading every page…",
  thinking: "AI is working out the structure…",
  writing: "Writing your editable notes…",
  retrying: "The free AI is busy — retrying in a moment…",
};

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

const hasText = (html: string) => Boolean(snippet(html));

export function NotesWorkspace({
  unitId,
  notes: serverNotes,
  documents,
  aiReady,
  initialNoteId,
  initialPanel = null,
}: {
  unitId: number;
  notes: NoteRow[];
  documents: WorkspaceDocument[];
  aiReady: boolean;
  initialNoteId?: number;
  initialPanel?: SidePanel;
}) {
  const router = useRouter();
  const { openUpload, openAiSettings, openShare, tree } = useShell();
  const { toast, confirm } = useFeedback();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isWide = useMediaQuery("(min-width: 1680px)");

  const [notes, setNotesState] = useState(serverNotes);
  // Mirror of `notes` for event handlers that run between renders.
  const notesRef = useRef(serverNotes);
  const setNotes = useCallback((update: (list: NoteRow[]) => NoteRow[]) => {
    notesRef.current = update(notesRef.current);
    setNotesState(notesRef.current);
  }, []);

  const [selectedId, setSelectedId] = useState<number | null>(initialNoteId ?? null);
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialNoteId));
  const [panel, setPanel] = useState<SidePanel>(initialPanel);
  const [listOpen, setListOpen] = useState(false);
  // Bumping a note's version remounts its editor with content that changed underneath it.
  const [editorVersions, setEditorVersions] = useState<Record<number, number>>({});
  const bumpEditors = useCallback((ids: number[]) => {
    if (!ids.length) return;
    setEditorVersions((v) => {
      const next = { ...v };
      for (const id of ids) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
  }, []);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<WorkspaceDocument | null>(null);
  const [transcribing, setTranscribing] = useState<{ docId: number; status: JobStatus; html: string } | null>(null);
  const [penMode, setPenMode] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const transcribeAbort = useRef<AbortController | null>(null);

  // Server data goes through the save store, which keeps whatever is newest: unsaved edits (even from a
  // window that was closed), a version this tab already saved (when the page came from cache), or the server's.
  // Runs after hydration, so the first render matches the server's HTML.
  const hydrated = useHydrated();
  const serverSig = serverNotes.map((n) => `${n.id}@${n.updated_at}@${n.ink_updated_at}`).join(",");
  const [seenSig, setSeenSig] = useState<string | null>(null);
  if (hydrated && serverSig !== seenSig) {
    setSeenSig(serverSig);
    const merged = seedNotes(serverNotes);
    const before = new Map(notes.map((n) => [n.id, n]));
    setNotesState(merged);
    bumpEditors(merged.filter((n) => before.has(n.id) && (before.get(n.id)!.content !== n.content || before.get(n.id)!.ink !== n.ink)).map((n) => n.id));
  }
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // A save that ran into changes made elsewhere: show the newest version, and any copy made of the edits here.
  useEffect(
    () =>
      onNoteSyncEvent((event) => {
        if (event.type === "replaced") {
          const current = notesRef.current.find((n) => n.id === event.note.id);
          if (!current) return;
          setNotes((list) => list.map((n) => (n.id === event.note.id ? event.note : n)));
          if (current.content !== event.note.content || current.ink !== event.note.ink) bumpEditors([event.note.id]);
        } else if (event.note.unit_id === unitId) {
          setNotes((list) => [event.note, ...list.filter((n) => n.id !== event.note.id && (event.reason !== "deleted" || n.id !== event.from))]);
          toast(
            event.reason === "conflict"
              ? `This note was changed in another window or device. Nothing was lost: your version is saved as "${event.note.title}".`
              : `This note was deleted somewhere else. Your unsaved changes are kept as "${event.note.title}".`,
            "info",
          );
          router.refresh();
        }
      }),
    [bumpEditors, router, setNotes, toast, unitId],
  );

  // Follow navigation that points at a specific note or panel (e.g. right after an upload).
  const [seenInitial, setSeenInitial] = useState({ note: initialNoteId, panel: initialPanel });
  if (seenInitial.note !== initialNoteId || seenInitial.panel !== initialPanel) {
    setSeenInitial({ note: initialNoteId, panel: initialPanel });
    if (initialNoteId) {
      setSelectedId(initialNoteId);
      setMobileEditor(true);
    }
    if (initialPanel) setPanel(initialPanel);
  }

  const docsById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents]);
  const imports = notes
    .filter((n) => n.kind === "import")
    .sort((a, b) => (docsById.get(a.document_id ?? 0)?.created_at ?? a.created_at).localeCompare(docsById.get(b.document_id ?? 0)?.created_at ?? b.created_at));
  const own = notes.filter((n) => n.kind === "note");
  const ordered = [...imports, ...own];
  const selected = notes.find((n) => n.id === selectedId) ?? (isDesktop ? ordered[0] : undefined) ?? null;
  const sync = useNoteSyncState(selected?.id);
  const selectedDoc = selected?.document_id ? docsById.get(selected.document_id) : undefined;
  const panelDoc = panel ? selectedDoc : undefined;
  const showList = !isDesktop || !panelDoc || isWide || listOpen;

  // Keep statuses fresh while AI works in the background.
  const anyRunning = documents.some((d) => d.condensing || d.transcribing);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [anyRunning, router]);

  const patchLocal = useCallback(
    (id: number, patch: Partial<Pick<NoteRow, "title" | "content">>) => {
      if (!notesRef.current.some((n) => n.id === id)) return;
      setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      editNoteText(id, patch);
    },
    [setNotes],
  );

  // Handwriting saves separately and doesn't count as a text edit.
  const patchInk = useCallback(
    (id: number, patch: Partial<Pick<NoteRow, "ink" | "line_spacing">>) => {
      if (!notesRef.current.some((n) => n.id === id)) return;
      setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
      editNoteInk(id, patch);
    },
    [setNotes],
  );

  const select = (id: number) => {
    // Unsaved edits to the previous note keep saving (and retrying) on their own.
    void flushNotes();
    setPenMode(false);
    setSelectedId(id);
    setMobileEditor(true);
    setListOpen(false);
  };

  const create = async () => {
    setCreating(true);
    try {
      void flushNotes();
      const [note] = seedNotes([await api<NoteRow>("/api/notes", { json: { unit_id: unitId, title: "", content: "" } })]);
      setNotes((list) => [note, ...list]);
      setSelectedId(note.id);
      setPanel(null);
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
    const isImport = note.kind === "import";
    const ok = await confirm({
      title: isImport ? "Delete this lecture?" : "Delete this note?",
      message: isImport
        ? `"${note.title}" — its editable notes, the original PDF and its condensed sheet will be permanently deleted.`
        : `"${note.title || "Untitled note"}" will be permanently deleted.`,
      confirmLabel: isImport ? "Delete lecture" : "Delete note",
      danger: true,
    });
    if (!ok) return;
    // Stop saving it first, so a late save can't bring the note back as a "recovered" copy.
    await flushNote(note.id);
    forgetNote(note.id);
    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete — check the connection and try again", "error");
      router.refresh();
      return;
    }
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setSelectedId(null);
    setPenMode(false);
    setPanel(null);
    setMobileEditor(false);
    toast(isImport ? "Lecture deleted" : "Note deleted");
    router.refresh();
  };

  // Title ↔ body keyboard flow: Enter or ↓ in the title moves into the note.
  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const editor = editorRef.current;
    if (!editor || e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const first = editor.state.doc.firstChild;
      const firstIsEmptyParagraph = first?.type.name === "paragraph" && first.content.size === 0;
      if (e.key === "Enter" && !editor.isEmpty && !firstIsEmptyParagraph) editor.commands.insertContentAt(0, { type: "paragraph" });
      // Move the caret and focus synchronously (editor.commands.focus waits a frame, and the
      // next keystroke would still land in the title).
      const { state, view } = editor;
      view.dispatch(state.tr.setSelection(Selection.atStart(state.doc)).scrollIntoView());
      view.focus();
    }
  };

  const focusTitle = useCallback(() => {
    const input = titleRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const attachTranscription = useCallback(
    async (doc: WorkspaceDocument, start: boolean) => {
      transcribeAbort.current?.abort();
      const controller = new AbortController();
      transcribeAbort.current = controller;
      let lastRender = 0;
      await consumeJobStream(
        `/api/documents/${doc.id}/transcribe`,
        start,
        {
          idle: () => setTranscribing(null),
          status: (status) => setTranscribing((t) => ({ docId: doc.id, status, html: t?.html ?? "" })),
          text: (markdown) => {
            const now = performance.now();
            if (now - lastRender < 100) return;
            lastRender = now;
            const html = DOMPurify.sanitize(markdownToHtml(markdown));
            setTranscribing((t) => ({ docId: doc.id, status: "writing", html: html || (t?.html ?? "") }));
          },
          done: async (event) => {
            const note = notesRef.current.find((n) => n.kind === "import" && n.document_id === doc.id);
            if (note) {
              // Take the saved note (with its new version), so edits made next aren't mistaken for out-of-date ones.
              const fresh = await api<NoteRow>(`/api/notes/${note.id}`).catch(() => null);
              const [shown] = seedNotes([fresh ?? { ...note, content: event.html }]);
              setNotes((list) => list.map((n) => (n.id === note.id ? shown : n)));
              bumpEditors([note.id]);
            }
            setTranscribing(null);
            toast(event.warning ?? "Converted — the notes are ready to edit", event.warning ? "info" : "success");
            router.refresh();
          },
          error: (message) => {
            setTranscribing(null);
            toast(message, "error");
          },
        },
        controller.signal,
      );
    },
    [bumpEditors, router, setNotes, toast],
  );

  // Reattach if a conversion for the open lecture is already running on the server.
  const selectedDocTranscribing = selectedDoc?.transcribing ? selectedDoc : undefined;
  useEffect(() => {
    // consumeJobStream subscribes to a server stream; its state updates happen after awaits.
    if (selectedDocTranscribing && transcribing?.docId !== selectedDocTranscribing.id) void attachTranscription(selectedDocTranscribing, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocTranscribing?.id]);

  useEffect(() => () => transcribeAbort.current?.abort(), []);

  /** Rewriting a lecture's text needs its latest edits saved first, so the replacement is what she agreed to. */
  const readyToReplace = async (note: NoteRow) => {
    if (await flushNote(note.id)) return true;
    toast("Your latest edits to this lecture haven't saved yet. Try again once it says Saved.", "error");
    return false;
  };

  const inkWarning = (note: NoteRow) => (note.ink ? " Your handwriting stays on the page, but may no longer line up with the new text." : "");

  const convertWithAi = async (doc: WorkspaceDocument, note: NoteRow) => {
    if (hasText(note.content) || note.ink) {
      const ok = await confirm({
        title: "Convert with AI?",
        message: `AI reads the original PDF — including scanned pages, tables and diagrams — and rewrites these notes from it. Any edits you've made to this lecture's text will be replaced.${inkWarning(note)}`,
        confirmLabel: "Convert",
      });
      if (!ok) return;
    }
    if (!(await readyToReplace(note))) return;
    setTranscribing({ docId: doc.id, status: "queued", html: "" });
    void attachTranscription(doc, true);
  };

  const reimport = async (doc: WorkspaceDocument, note: NoteRow) => {
    if (hasText(note.content) || note.ink) {
      const ok = await confirm({
        title: "Re-import from the PDF?",
        message: `The text is rebuilt from the original PDF with fresh formatting (headings, bold terms, indented lists). Any edits or highlights you've made to this lecture's text will be replaced.${inkWarning(note)}`,
        confirmLabel: "Re-import",
      });
      if (!ok) return;
    }
    if (!(await readyToReplace(note))) return;
    try {
      const result = await api<{ note: NoteRow | null; scanned: boolean }>(`/api/documents/${doc.id}/reimport`, { method: "POST" });
      if (result.note && !result.scanned) {
        const [fresh] = seedNotes([result.note]);
        setNotes((list) => list.map((n) => (n.id === fresh.id ? fresh : n)));
        bumpEditors([fresh.id]);
      }
      toast(
        result.scanned ? "This PDF has no selectable text, so nothing was changed. Try Convert with AI instead." : "Re-imported with fresh formatting",
        result.scanned ? "info" : "success",
      );
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't re-import", "error");
    }
  };

  /** Saves the note as a file. Everything typed is saved first, so the copy is up to date. */
  const saveCopy = async (note: NoteRow, format: "pdf" | "word") => {
    if (!(await flushNote(note.id))) {
      toast("Saving your latest edits first — try again in a moment.", "error");
      return;
    }
    const url = `/api/notes/${note.id}/export?format=${format}`;
    if (format === "word") {
      // The response is an attachment, so this downloads without leaving the page.
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      toast("Saved as a Word document — check your downloads. Handwriting only comes through in PDF.", "info");
      return;
    }
    // A tab, so the browser's own print window can offer "Save as PDF" (and "Save to Files" on an iPad).
    const tab = window.open(url, "_blank");
    if (!tab) toast("Allow pop-ups for this site to save a PDF, or use the Word option.", "error");
  };

  const togglePanel = (which: Exclude<SidePanel, null>) => setPanel((p) => (p === which ? null : which));

  const docStatus = (doc: WorkspaceDocument | undefined, note: NoteRow) => {
    if (!doc) return null;
    if (doc.transcribing || transcribing?.docId === doc.id)
      return (
        <span className="inline-flex items-center gap-1 text-accent">
          <Spinner className="size-3" /> Converting
        </span>
      );
    if (doc.condensing)
      return (
        <span className="inline-flex items-center gap-1 text-accent">
          <Spinner className="size-3" /> Condensing
        </span>
      );
    if (!hasText(note.content))
      return (
        <span className="inline-flex items-center gap-1 text-[var(--tc-orange)]">
          <AlertTriangle className="size-3" /> No text yet
        </span>
      );
    if (doc.sheet.sheet)
      return (
        <span className="inline-flex items-center gap-1 text-accent">
          <CheckCircle2 className="size-3" /> Condensed
        </span>
      );
    return null;
  };

  // ── empty unit ──
  if (!notes.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-sunken text-ink-2">
          <NotebookPen className="size-6" />
        </div>
        <h3 className="font-serif text-2xl font-semibold tracking-tight">Lectures and notes, in one place</h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-3">
          Import the PDFs from your program and they become editable notes — highlight, cut, and add your own thoughts right
          in the text. Or start a blank note.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" size="lg" onClick={() => openUpload({ unitId })}>
            <UploadCloud /> Import PDFs
          </Button>
          <Button variant="secondary" size="lg" onClick={create} disabled={creating}>
            <Plus /> New note
          </Button>
        </div>
      </div>
    );
  }

  const listItem = (n: NoteRow) => {
    const doc = n.document_id ? docsById.get(n.document_id) : undefined;
    const isImport = n.kind === "import";
    const active = selected?.id === n.id;
    return (
      <button
        key={n.id}
        onClick={() => select(n.id)}
        className={clsx(
          "group w-full rounded-lg px-3 py-2.5 text-left transition-colors",
          active ? "bg-card shadow-[var(--shadow-sm)] ring-1 ring-line" : "hover:bg-hover",
        )}
      >
        <div className="flex items-start gap-2">
          {isImport && <FileText className="mt-0.5 size-4 shrink-0 text-danger/80" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-ink">{n.title || "Untitled note"}</div>
            {isImport ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                {doc?.page_count ? <span>{doc.page_count} page{doc.page_count === 1 ? "" : "s"}</span> : null}
                {docStatus(doc, n)}
              </div>
            ) : (
              <>
                <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{snippet(n.content) || "Empty note"}</div>
                <div className="mt-1 text-[11px] text-ink-3">
                  <RelativeTime iso={n.updated_at} />
                </div>
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  const list = (
    <aside
      className={clsx(
        "shrink-0 flex-col border-r border-line bg-sunken/60",
        isDesktop ? "flex w-72" : mobileEditor ? "hidden" : "flex w-full",
        isDesktop && panelDoc && !isWide && "absolute inset-y-0 left-0 z-20 shadow-float",
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <span className="flex-1 text-xs font-semibold tracking-wider text-ink-3 uppercase">
          {notes.length} item{notes.length === 1 ? "" : "s"}
        </span>
        <Button size="sm" onClick={() => openUpload({ unitId })} title="Import PDFs">
          <UploadCloud /> Import
        </Button>
        <Button size="sm" variant="primary" onClick={create} disabled={creating}>
          <Plus /> New
        </Button>
        {isDesktop && panelDoc && !isWide && (
          <button onClick={() => setListOpen(false)} className="rounded-md p-1 text-ink-3 hover:bg-hover" aria-label="Hide list">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {imports.length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Lectures & readings</div>
            <div className="flex flex-col gap-0.5">{imports.map(listItem)}</div>
          </>
        )}
        {own.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">My notes</div>
            <div className="flex flex-col gap-0.5">{own.map(listItem)}</div>
          </>
        )}
      </div>
    </aside>
  );

  const pad = "px-6 sm:px-10";
  const isImport = selected?.kind === "import";
  const scanned = Boolean(isImport && selected && !hasText(selected.content));
  const converting = Boolean(selectedDoc && transcribing?.docId === selectedDoc.id);

  const editorPane = selected && (
    <section
      className={clsx(
        "min-w-0 flex-1 flex-col bg-card",
        penMode ? "fixed inset-0 z-[55] flex" : isDesktop || mobileEditor ? "flex" : "hidden",
      )}
    >
      {converting ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={clsx("flex items-center gap-3 border-b border-line py-3", pad)}>
            <Spinner className="size-4 text-accent" />
            <span className="shimmer-text text-sm font-medium">{TRANSCRIBE_LABEL[transcribing!.status]}</span>
          </div>
          <div className={clsx("flex-1 overflow-y-auto py-8", pad)}>
            <h1 className="mb-4 font-serif text-[28px] leading-tight font-semibold tracking-tight">{selected.title}</h1>
            {transcribing!.html ? (
              <div className="rich rich-note" dangerouslySetInnerHTML={{ __html: transcribing!.html }} />
            ) : (
              <p className="text-sm text-ink-3">Long PDFs can take a few minutes. You can keep working elsewhere — it continues in the background.</p>
            )}
          </div>
        </div>
      ) : (
        <RichEditor
          key={`${selected.id}:${editorVersions[selected.id] ?? 0}`}
          content={selected.content}
          onUpdate={(html) => patchLocal(selected.id, { content: html })}
          onReady={(editor) => (editorRef.current = editor)}
          onExitTop={focusTitle}
          ink={{
            value: selected.ink ?? "",
            lineSpacing: selected.line_spacing ?? "",
            onChange: (json) => patchInk(selected.id, { ink: json }),
            onLineSpacingChange: (value) => patchInk(selected.id, { line_spacing: value }),
            penMode,
            onPenModeChange: (on) => {
              setPenMode(on);
              if (!on) void flushNotes();
            },
            title: selected.title,
            saveIndicator: <SaveIndicator status={sync.status} error={sync.error} blocked={sync.blocked} onRetry={() => void flushNotes(true)} />,
          }}
          placeholder={isImport ? "This lecture has no text yet." : undefined}
          className="min-h-0 flex-1"
          toolbarClassName="sticky top-0 z-10 px-4 sm:px-8"
          contentClassName="overflow-y-auto pb-16"
          header={
            <div className="mx-auto w-full max-w-[760px] px-6 pt-5 pb-2 sm:px-12">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {!isDesktop && (
                  <button onClick={() => setMobileEditor(false)} className="-ml-1 flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
                    <ChevronLeft className="size-4" /> All
                  </button>
                )}
                {isDesktop && !showList && (
                  <Button size="sm" variant="ghost" onClick={() => setListOpen(true)}>
                    <PanelLeft /> Notes
                  </Button>
                )}
                {selectedDoc && (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                      <FileText className="size-3.5 text-danger/80" />
                      {isImport ? "Lecture PDF" : `On ${selectedDoc.title}`}
                      {selectedDoc.page_count ? ` · ${selectedDoc.page_count} page${selectedDoc.page_count === 1 ? "" : "s"}` : ""}
                      {isImport && (selectedDoc.import_method === "ai" || selectedDoc.import_method === "claude") && (
                        <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">Converted by AI</span>
                      )}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant={panel === "pdf" ? "subtle" : "ghost"} onClick={() => togglePanel("pdf")}>
                        <FileSearch /> <span className="hidden sm:inline">Original</span>
                      </Button>
                      <Button size="sm" variant={panel === "sheet" ? "subtle" : "ghost"} onClick={() => togglePanel("sheet")}>
                        <Sparkles /> <span className="hidden sm:inline">Condensed</span>
                      </Button>
                      {isImport && (
                        <Menu
                          triggerClassName={buttonClass("ghost", "icon-sm")}
                          trigger={<MoreHorizontal />}
                          items={[
                            { label: "Convert with AI", icon: <Wand2 />, disabled: !aiReady, onSelect: () => convertWithAi(selectedDoc, selected) },
                            { label: "Re-import from PDF", icon: <RefreshCw />, onSelect: () => reimport(selectedDoc, selected) },
                            { label: "Download PDF", icon: <Download />, onSelect: () => window.open(`/api/documents/${selectedDoc.id}/file?download=1`, "_blank") },
                            { label: "Move to another unit", icon: <FolderInput />, onSelect: () => setMoving(selectedDoc) },
                            { label: "Delete lecture", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => remove(selected) },
                          ]}
                        />
                      )}
                    </div>
                  </>
                )}
                {!isDesktop && !selectedDoc && <span className="flex-1" />}
              </div>
              <input
                ref={titleRef}
                value={selected.title}
                placeholder="Untitled note"
                maxLength={200}
                onChange={(e) => patchLocal(selected.id, { title: e.target.value })}
                onKeyDown={onTitleKeyDown}
                className="w-full bg-transparent font-serif text-[28px] leading-tight font-semibold tracking-tight text-ink placeholder:text-ink-3/60 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <RelativeTime iso={selected.updated_at} prefix={isImport ? "Updated " : "Edited "} />
                <SaveIndicator status={sync.status} error={sync.error} blocked={sync.blocked} onRetry={() => void flushNotes(true)} />
              </div>
              {scanned && selectedDoc && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--tc-orange)_35%,transparent)] bg-[color-mix(in_oklab,var(--tc-orange)_8%,transparent)] px-4 py-3 text-sm">
                  <AlertTriangle className="size-4 shrink-0 text-[var(--tc-orange)]" />
                  <span className="min-w-0 flex-1 text-ink-2">
                    No selectable text was found — this PDF is probably scanned or image-based.
                    {!aiReady && " Set up free AI to convert it into editable text."}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setPanel("pdf")}>
                    <FileSearch /> View original
                  </Button>
                  {aiReady ? (
                    <Button size="sm" variant="primary" onClick={() => convertWithAi(selectedDoc, selected)}>
                      <Wand2 /> Convert with AI
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={openAiSettings}>
                      <Sparkles /> Set up free AI
                    </Button>
                  )}
                </div>
              )}
            </div>
          }
          footer={(ed) => (
            <div className={clsx("flex items-center justify-between border-t border-line py-2 text-xs text-ink-3", pad)}>
              <WordCount editor={ed} />
              <Menu
                triggerClassName="ml-auto flex items-center gap-1.5 text-xs text-ink-3 hover:text-accent"
                trigger={
                  <>
                    <Download className="size-3.5" /> Save a copy
                  </>
                }
                items={[
                  {
                    label: "PDF (keeps handwriting)",
                    icon: <Printer />,
                    onSelect: () => void saveCopy(selected, "pdf"),
                  },
                  {
                    label: "Word document",
                    icon: <FileType2 />,
                    onSelect: () => void saveCopy(selected, "word"),
                  },
                ]}
              />
              <button
                onClick={() => openShare({ scope: "note", id: selected.id, title: selected.title || "Untitled note" })}
                className="ml-4 flex items-center gap-1.5 hover:text-accent"
                title="Share with classmates"
              >
                <Share2 className="size-3.5" /> Share
              </button>
              <button onClick={() => remove(selected)} className="ml-4 flex items-center gap-1.5 hover:text-danger">
                <Trash2 className="size-3.5" /> {isImport ? "Delete lecture" : "Delete"}
              </button>
            </div>
          )}
        />
      )}
    </section>
  );

  const sidePanel = panelDoc && (
    <aside
      className={clsx(
        "flex min-w-0 flex-col border-l border-line bg-card",
        isDesktop ? "w-[44%] max-w-[780px] min-w-[400px]" : "fixed inset-0 z-40",
      )}
    >
      <div className="flex items-center gap-1 border-b border-line bg-paper/70 px-3 py-2">
        {(
          [
            ["pdf", "Original PDF", FileSearch],
            ["sheet", "Condensed sheet", Sparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setPanel(id)}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              panel === id ? "bg-card text-ink shadow-[var(--shadow-sm)] ring-1 ring-line" : "text-ink-3 hover:text-ink",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
        <button onClick={() => setPanel(null)} className="ml-auto rounded-lg p-1.5 text-ink-3 hover:bg-hover hover:text-ink" aria-label="Close panel">
          <X className="size-4" />
        </button>
      </div>
      {panel === "pdf" ? (
        <iframe key={panelDoc.id} title={panelDoc.title} src={`/api/documents/${panelDoc.id}/file#view=FitH`} className="min-h-0 w-full flex-1 border-0 bg-sunken" />
      ) : (
        <SheetPanel
          key={panelDoc.id}
          compact
          scope="document"
          scopeId={panelDoc.id}
          initial={panelDoc.sheet}
          aiReady={aiReady}
          emptyTitle="Condense this lecture"
          emptyBody={`AI turns ${panelDoc.page_count > 1 ? `all ${panelDoc.page_count} pages` : "this lecture"} into a dense study sheet that fits on about one printed page. Your highlights in the notes count as important.`}
        />
      )}
    </aside>
  );

  return (
    <div className="relative flex min-h-0 flex-1">
      {showList && list}
      {editorPane}
      {sidePanel}
      <MoveDocumentDialog
        document={moving}
        tree={tree}
        onClose={() => setMoving(null)}
        onMoved={(target) => {
          setMoving(null);
          router.push(`/units/${target}?tab=notes`);
          router.refresh();
        }}
      />
    </div>
  );
}
