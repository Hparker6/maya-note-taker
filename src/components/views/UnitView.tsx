"use client";

import clsx from "clsx";
import { FileText, MoreHorizontal, NotebookPen, Pencil, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { classColor } from "@/lib/colors";
import type { DocumentListItem } from "@/lib/repo";
import type { NoteRow, SheetState, UnitContext } from "@/lib/types";
import { DocumentList } from "../DocumentList";
import { NotesWorkspace } from "../NotesWorkspace";
import { Breadcrumbs } from "../PageHeader";
import { SheetPanel } from "../SheetPanel";
import { useShell } from "../shell/ShellContext";
import { useTreeActions } from "../shell/useTreeActions";
import { Button, buttonClass } from "../ui/Button";
import { Menu } from "../ui/Menu";

export type UnitTab = "sheet" | "pdfs" | "notes";
export type UnitDocument = DocumentListItem & { condensing: boolean };

export function UnitView({
  ctx,
  documents,
  notes,
  sheet,
  aiReady,
  initialTab,
  initialNoteId,
}: {
  ctx: UnitContext;
  documents: UnitDocument[];
  notes: NoteRow[];
  sheet: SheetState;
  aiReady: boolean;
  initialTab: UnitTab;
  initialNoteId?: number;
}) {
  const router = useRouter();
  const { openUpload } = useShell();
  const actions = useTreeActions();
  const [tab, setTab] = useState<UnitTab>(initialTab);
  const refresh = useCallback(() => router.refresh(), [router]);
  const { unit, section, klass } = ctx;

  const switchTab = (next: UnitTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("note");
    window.history.replaceState(null, "", url);
  };

  const noteWords = notes.some((n) => n.content.replace(/<[^>]+>/g, "").trim());
  const pages = documents.reduce((n, d) => n + d.page_count, 0);
  const sources = [
    documents.length ? `${documents.length} PDF${documents.length > 1 ? "s" : ""} (${pages} pages)` : "",
    notes.length ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" + ");

  const tabs: { id: UnitTab; label: string; short: string; icon: typeof FileText; count?: number }[] = [
    { id: "sheet", label: "Study sheet", short: "Sheet", icon: Sparkles },
    { id: "pdfs", label: "Curriculum PDFs", short: "PDFs", icon: FileText, count: documents.length },
    { id: "notes", label: "My notes", short: "Notes", icon: NotebookPen, count: notes.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper px-6 pt-6 sm:px-10">
        <Breadcrumbs
          items={[
            { label: klass.name, href: `/classes/${klass.id}`, color: classColor(klass.color) },
            { label: section.name, href: `/sections/${section.id}` },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 font-serif text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{unit.name}</h1>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => openUpload({ unitId: unit.id })}>
              <UploadCloud /> Upload PDFs
            </Button>
            <Menu
              triggerClassName={buttonClass("ghost", "icon")}
              trigger={<MoreHorizontal />}
              items={[
                { label: "Rename unit", icon: <Pencil />, onSelect: () => actions.renameUnit(unit) },
                {
                  label: "Delete unit",
                  icon: <Trash2 />,
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => actions.deleteUnit(unit, `/sections/${section.id}`),
                },
              ]}
            />
          </div>
        </div>
        <div role="tablist" className="-mb-px mt-5 flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, short, icon: Icon, count }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              className={clsx(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 text-sm font-medium transition-colors",
                tab === id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
              )}
            >
              <Icon className="size-4" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
              {count !== undefined && (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-px text-[11px] tabular-nums",
                    tab === id ? "bg-accent-soft text-accent" : "bg-sunken text-ink-3",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-card">
        {tab === "sheet" && (
          <SheetPanel
            scope="unit"
            scopeId={unit.id}
            initial={sheet}
            aiReady={aiReady}
            blockedReason={!documents.length && !noteWords ? "Upload a PDF or write a note in this unit first." : undefined}
            emptyTitle="Build this unit's study sheet"
            emptyBody="Claude reads every PDF here plus your own notes, then writes one dense, organized sheet — your notes marked with ★ — sized to print on one or two pages."
            sourceSummary={sources || undefined}
          />
        )}
        {tab === "pdfs" && (
          <DocumentList unitId={unit.id} documents={documents} aiReady={aiReady} onChanged={refresh} />
        )}
        {tab === "notes" && (
          <NotesWorkspace
            unitId={unit.id}
            notes={notes}
            initialNoteId={initialNoteId}
            documentTitles={Object.fromEntries(documents.map((d) => [d.id, d.title]))}
          />
        )}
      </div>
    </div>
  );
}
