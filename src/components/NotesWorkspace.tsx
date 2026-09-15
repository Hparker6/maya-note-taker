"use client";

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
import type { JobStatus, NoteRow, WorkspaceDocument } from "@/lib/types";
import { useAutosave } from "@/lib/useAutosave";
import { useMediaQuery } from "@/lib/useMediaQuery";
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
  queued: "Waiting for other Claude work to finish…",
  reading: "Claude is reading every page…",
  thinking: "Claude is working out the structure…",
  writing: "Writing your editable notes…",
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
  const { openUpload, tree } = useShell();
  const { toast, confirm } = useFeedback();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isWide = useMediaQuery("(min-width: 1680px)");

  const [notes, setNotesState] = useState(serverNotes);
  // Mirror of `notes` so autosave always sees the latest title + content together.
  const notesRef = useRef(serverNotes);
  const setNotes = useCallback((update: (list: NoteRow[]) => NoteRow[]) => {
    notesRef.current = update(notesRef.current);
    setNotesState(notesRef.current);
  }, []);

  const [selectedId, setSelectedId] = useState<number | null>(initialNoteId ?? null);
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialNoteId));
  const [panel, setPanel] = useState<SidePanel>(initialPanel);
  const [listOpen, setListOpen] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<WorkspaceDocument | null>(null);
  const [transcribing, setTranscribing] = useState<{ docId: number; status: JobStatus; html: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const transcribeAbort = useRef<AbortController | null>(null);

  const saver = useAutosave(async (note: { id: number; title: string; content: string }) => {
    const res = await api<{ updated_at: string }>(`/api/notes/${note.id}`, {
      method: "PATCH",
      json: { title: note.title, content: note.content },
    });
    setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, updated_at: res.updated_at } : n)));
  });

  // Merge fresh server data (new imports, Claude conversions) without clobbering unsaved typing.
  const serverSig = serverNotes.map((n) => `${n.id}@${n.updated_at}`).join(",");
  const [seenSig, setSeenSig] = useState(serverSig);
  if (serverSig !== seenSig) {
    setSeenSig(serverSig);
    const local = new Map(notes.map((n) => [n.id, n]));
    const busy = saver.status === "pending" || saver.status === "saving";
    const merged = serverNotes.map((s) => {
      const l = local.get(s.id);
      return !l || (s.updated_at > l.updated_at && !(busy && s.id === selectedId)) ? s : l;
    });
    const openNote = local.get(selectedId ?? -1);
    const refreshedOpenNote = merged.find((n) => n.id === selectedId);
    setNotesState(merged);
    if (openNote && refreshedOpenNote && refreshedOpenNote.content !== openNote.content) setEditorVersion((v) => v + 1);
  }
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

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
  const selectedDoc = selected?.document_id ? docsById.get(selected.document_id) : undefined;
  const panelDoc = panel ? selectedDoc : undefined;
  const showList = !isDesktop || !panelDoc || isWide || listOpen;

  // Keep statuses fresh while Claude works in the background.
  const anyRunning = documents.some((d) => d.condensing || d.transcribing);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [anyRunning, router]);

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
    setListOpen(false);
  };

  const create = async () => {
    setCreating(true);
    try {
      await saver.flush();
      const note = await api<NoteRow>("/api/notes", { json: { unit_id: unitId, title: "", content: "" } });
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
    await saver.flush();
    await api(`/api/notes/${note.id}`, { method: "DELETE" });
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setSelectedId(null);
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
      if (e.key === "Enter" && !editor.isEmpty && !firstIsEmptyParagraph) {
        editor.chain().insertContentAt(0, { type: "paragraph" }).focus("start").run();
      } else {
        editor.commands.focus("start");
      }
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
          done: (event) => {
            const note = notesRef.current.find((n) => n.kind === "import" && n.document_id === doc.id);
            if (note) setNotes((list) => list.map((n) => (n.id === note.id ? { ...n, content: event.html, updated_at: new Date().toISOString() } : n)));
            setTranscribing(null);
            setEditorVersion((v) => v + 1);
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
    [router, setNotes, toast],
  );

  // Reattach if a conversion for the open lecture is already running on the server.
  const selectedDocTranscribing = selectedDoc?.transcribing ? selectedDoc : undefined;
  useEffect(() => {
    // consumeJobStream subscribes to a server stream; its state updates happen after awaits.
    if (selectedDocTranscribing && transcribing?.docId !== selectedDocTranscribing.id) void attachTranscription(selectedDocTranscribing, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocTranscribing?.id]);

  useEffect(() => () => transcribeAbort.current?.abort(), []);

  const convertWithClaude = async (doc: WorkspaceDocument, note: NoteRow) => {
    if (hasText(note.content)) {
      const ok = await confirm({
        title: "Convert with Claude?",
        message:
          "Claude reads the original PDF — including scanned pages, tables and diagrams — and rewrites these notes from it. Any edits you've made to this lecture's text will be replaced.",
        confirmLabel: "Convert",
      });
      if (!ok) return;
    }
    await saver.flush();
    setTranscribing({ docId: doc.id, status: "queued", html: "" });
    void attachTranscription(doc, true);
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
                {doc?.page_count ? <span>{doc.page_count} pages</span> : null}
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
    <section className={clsx("min-w-0 flex-1 flex-col bg-card", isDesktop || mobileEditor ? "flex" : "hidden")}>
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
          key={`${selected.id}:${editorVersion}`}
          content={selected.content}
          onUpdate={(html) => patchLocal(selected.id, { content: html })}
          onReady={(editor) => (editorRef.current = editor)}
          onExitTop={focusTitle}
          placeholder={isImport ? "This lecture has no text yet." : undefined}
          className="min-h-0 flex-1"
          toolbarClassName="sticky top-0 z-10 px-4 sm:px-8"
          contentClassName={clsx("overflow-y-auto pb-16", pad)}
          header={
            <div className={clsx("pt-5 pb-2", pad)}>
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
                      {selectedDoc.page_count ? ` · ${selectedDoc.page_count} pages` : ""}
                      {isImport && selectedDoc.import_method === "claude" && (
                        <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">Converted by Claude</span>
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
                            { label: "Convert with Claude", icon: <Wand2 />, disabled: !aiReady, onSelect: () => convertWithClaude(selectedDoc, selected) },
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
                <SaveIndicator status={saver.status} onRetry={() => void saver.flush()} />
              </div>
              {scanned && selectedDoc && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--tc-orange)_35%,transparent)] bg-[color-mix(in_oklab,var(--tc-orange)_8%,transparent)] px-4 py-3 text-sm">
                  <AlertTriangle className="size-4 shrink-0 text-[var(--tc-orange)]" />
                  <span className="min-w-0 flex-1 text-ink-2">
                    No selectable text was found — this PDF is probably scanned or image-based.
                    {!aiReady && " Add an API key to let Claude convert it."}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setPanel("pdf")}>
                    <FileSearch /> View original
                  </Button>
                  {aiReady && (
                    <Button size="sm" variant="primary" onClick={() => convertWithClaude(selectedDoc, selected)}>
                      <Wand2 /> Convert with Claude
                    </Button>
                  )}
                </div>
              )}
            </div>
          }
          footer={(ed) => (
            <div className={clsx("flex items-center justify-between border-t border-line py-2 text-xs text-ink-3", pad)}>
              <WordCount editor={ed} />
              <button onClick={() => remove(selected)} className="flex items-center gap-1.5 hover:text-danger">
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
          emptyBody={`Claude turns ${panelDoc.page_count ? `all ${panelDoc.page_count} pages` : "this lecture"} into a dense study sheet that fits on about one printed page. Your highlights in the notes count as important.`}
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
