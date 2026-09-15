"use client";

import clsx from "clsx";
import {
  ChevronLeft,
  Columns2,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, formatBytes } from "@/lib/client";
import { classColor } from "@/lib/colors";
import type { DocumentRow, NoteRow, SheetState, UnitContext } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MoveDocumentDialog } from "../MoveDocumentDialog";
import { NotesWorkspace } from "../NotesWorkspace";
import { SheetPanel } from "../SheetPanel";
import { useShell } from "../shell/ShellContext";
import { buttonClass } from "../ui/Button";
import { useFeedback } from "../ui/feedback";
import { Menu } from "../ui/Menu";

type Panel = "sheet" | "notes";
type Layout = "split" | "pdf" | "panel";

export function DocumentView({
  doc,
  ctx,
  sheet,
  notes,
  aiReady,
  initialPanel,
  initialNoteId,
}: {
  doc: DocumentRow;
  ctx: UnitContext;
  sheet: SheetState;
  notes: NoteRow[];
  aiReady: boolean;
  initialPanel: Panel;
  initialNoteId?: number;
}) {
  const router = useRouter();
  const { tree } = useShell();
  const { toast, confirm, prompt } = useFeedback();
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [layout, setLayout] = useState<Layout>("split");
  const [mobileView, setMobileView] = useState<"pdf" | Panel>(initialNoteId ? "notes" : "pdf");
  const [moving, setMoving] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const fileUrl = `/api/documents/${doc.id}/file`;

  const rename = async () => {
    const title = await prompt({ title: "Rename PDF", label: "Title", initial: doc.title });
    if (!title || title === doc.title) return;
    try {
      await api(`/api/documents/${doc.id}`, { method: "PATCH", json: { title } });
      toast("PDF renamed");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't rename", "error");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${doc.title}”?`,
      message: "The PDF and its condensed sheet are deleted. Notes you took on it stay in the unit.",
      confirmLabel: "Delete PDF",
      danger: true,
    });
    if (!ok) return;
    await api(`/api/documents/${doc.id}`, { method: "DELETE" });
    toast("PDF deleted");
    router.push(`/units/${ctx.unit.id}?tab=pdfs`);
    router.refresh();
  };

  const panelBody = (which: Panel) =>
    which === "sheet" ? (
      <SheetPanel
        compact
        scope="document"
        scopeId={doc.id}
        initial={sheet}
        aiReady={aiReady}
        emptyTitle="Condense this PDF"
        emptyBody={`Claude reads all ${doc.page_count || ""} pages and writes a dense study sheet that fits on about one printed page. You can edit it afterwards.`}
      />
    ) : (
      <NotesWorkspace compact unitId={ctx.unit.id} documentId={doc.id} notes={notes} initialNoteId={initialNoteId} />
    );

  const panelTabs = (
    <div className="flex items-center gap-1">
      {(
        [
          ["sheet", "Condensed", Sparkles],
          ["notes", `My notes${notes.length ? ` · ${notes.length}` : ""}`, NotebookPen],
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
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-paper px-4 py-2.5 sm:px-6">
        <Link
          href={`/units/${ctx.unit.id}?tab=pdfs`}
          className="flex items-center gap-1 rounded-lg py-1 pr-2 text-[13px] text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          <span className="size-2 rounded-full" style={{ background: classColor(ctx.klass.color) }} />
          <span className="max-w-[180px] truncate">{ctx.unit.name}</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="size-4 shrink-0 text-danger/80" />
          <h1 className="truncate font-serif text-lg font-semibold tracking-tight" title={doc.title}>
            {doc.title}
          </h1>
          <span className="hidden shrink-0 text-xs text-ink-3 md:inline">
            {doc.page_count ? `${doc.page_count} pages · ` : ""}
            {formatBytes(doc.size)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 hidden items-center rounded-lg border border-line bg-card p-0.5 lg:flex">
            {(
              [
                ["pdf", PanelRightClose, "PDF only"],
                ["split", Columns2, "Side by side"],
                ["panel", PanelLeftClose, "Notes only"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                title={label}
                aria-label={label}
                onClick={() => setLayout(id)}
                className={clsx(
                  "grid size-7 place-items-center rounded-md transition-colors",
                  layout === id ? "bg-accent-soft text-accent" : "text-ink-3 hover:text-ink",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <a href={`${fileUrl}?download=1`} className={buttonClass("ghost", "icon")} title="Download" aria-label="Download">
            <Download />
          </a>
          <Menu
            triggerClassName={buttonClass("ghost", "icon")}
            trigger={<MoreHorizontal />}
            items={[
              { label: "Open PDF in new tab", icon: <ExternalLink />, onSelect: () => window.open(fileUrl, "_blank") },
              { label: "Rename", icon: <Pencil />, onSelect: rename },
              { label: "Move to another unit", icon: <FolderInput />, onSelect: () => setMoving(true) },
              { label: "Delete PDF", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: remove },
            ]}
          />
        </div>
      </header>

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          {layout !== "panel" && (
            <div className={clsx("min-w-0 bg-sunken", layout === "split" ? "flex-1" : "w-full")}>
              <iframe title={doc.title} src={`${fileUrl}#view=FitH`} className="h-full w-full border-0" />
            </div>
          )}
          {layout !== "pdf" && (
            <div
              className={clsx(
                "flex min-w-0 flex-col border-l border-line bg-card",
                layout === "split" ? "w-[46%] max-w-[760px] min-w-[420px]" : "mx-auto w-full max-w-4xl border-r",
              )}
            >
              <div className="flex items-center justify-between border-b border-line bg-paper/70 px-3 py-2">{panelTabs}</div>
              {panelBody(panel)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex border-b border-line bg-paper px-3 py-1.5">
            {(
              [
                ["pdf", "PDF"],
                ["sheet", "Condensed"],
                ["notes", "My notes"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMobileView(id)}
                className={clsx(
                  "flex-1 rounded-lg py-1.5 text-[13px] font-medium",
                  mobileView === id ? "bg-card text-ink shadow-[var(--shadow-sm)] ring-1 ring-line" : "text-ink-3",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col bg-card">
            {mobileView === "pdf" ? (
              <iframe title={doc.title} src={`${fileUrl}#view=FitH`} className="h-full w-full flex-1 border-0 bg-sunken" />
            ) : (
              panelBody(mobileView)
            )}
          </div>
        </>
      )}

      <MoveDocumentDialog
        document={moving ? doc : null}
        tree={tree}
        onClose={() => setMoving(false)}
        onMoved={() => {
          setMoving(false);
          router.refresh();
        }}
      />
    </div>
  );
}
