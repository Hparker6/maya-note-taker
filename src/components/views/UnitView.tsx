"use client";

import clsx from "clsx";
import { Brain, MoreHorizontal, NotebookPen, Pencil, Share2, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { classColor } from "@/lib/colors";
import type { NoteRow, SheetState, UnitContext, UnitPracticeData, WorkspaceDocument } from "@/lib/types";
import { NotesWorkspace, type SidePanel } from "../NotesWorkspace";
import { PracticePanel } from "../practice/PracticePanel";
import { Breadcrumbs } from "../PageHeader";
import { SheetPanel } from "../SheetPanel";
import { useShell } from "../shell/ShellContext";
import { useTreeActions } from "../shell/useTreeActions";
import { Button, buttonClass } from "../ui/Button";
import { Menu } from "../ui/Menu";

export type UnitTab = "notes" | "sheet" | "practice";

export function UnitView({
  ctx,
  documents,
  notes,
  sheet,
  practice,
  aiReady,
  initialTab,
  initialNoteId,
  initialPanel,
}: {
  ctx: UnitContext;
  documents: WorkspaceDocument[];
  notes: NoteRow[];
  sheet: SheetState;
  practice: UnitPracticeData;
  aiReady: boolean;
  initialTab: UnitTab;
  initialNoteId?: number;
  initialPanel?: SidePanel;
}) {
  const { openUpload, openShare } = useShell();
  const actions = useTreeActions();
  const [tab, setTab] = useState<UnitTab>(initialTab);
  const { unit, section, klass } = ctx;

  // A link to a specific note (search, upload) always opens the notes tab.
  const [seenNote, setSeenNote] = useState(initialNoteId);
  if (seenNote !== initialNoteId) {
    setSeenNote(initialNoteId);
    if (initialNoteId) setTab("notes");
  }

  const switchTab = (next: UnitTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    url.searchParams.delete("note");
    url.searchParams.delete("panel");
    window.history.replaceState(null, "", url);
  };

  const ownNotes = notes.filter((n) => n.kind === "note" && n.content.replace(/<[^>]+>/g, "").trim());
  const pages = documents.reduce((n, d) => n + d.page_count, 0);
  const sources = [
    documents.length ? `${documents.length} lecture${documents.length > 1 ? "s" : ""} (${pages} pages)` : "",
    ownNotes.length ? `${ownNotes.length} note${ownNotes.length > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" + ");

  const tabs = [
    { id: "notes" as const, label: "Notes", icon: NotebookPen, count: notes.length },
    { id: "sheet" as const, label: "Study sheet", icon: Sparkles, count: undefined },
    { id: "practice" as const, label: "Practice", icon: Brain, count: practice.stats.total || undefined },
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
              <UploadCloud /> Import PDFs
            </Button>
            <Menu
              triggerClassName={buttonClass("ghost", "icon")}
              trigger={<MoreHorizontal />}
              items={[
                { label: "Share unit", icon: <Share2 />, onSelect: () => openShare({ scope: "unit", id: unit.id, title: unit.name }) },
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
          {tabs.map(({ id, label, icon: Icon, count }) => (
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
              {label}
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
        {tab === "practice" ? (
          <PracticePanel
            unitId={unit.id}
            unitName={unit.name}
            initial={practice}
            hasMaterial={documents.length > 0 || notes.some((n) => n.content.replace(/<[^>]+>/g, "").trim())}
          />
        ) : tab === "sheet" ? (
          <SheetPanel
            scope="unit"
            scopeId={unit.id}
            initial={sheet}
            aiReady={aiReady}
            blockedReason={!documents.length && !ownNotes.length ? "Import a PDF or write a note in this unit first." : undefined}
            emptyTitle="Build this unit's study sheet"
            emptyBody="AI reads every lecture here — including your edits and highlights — plus your own notes, then writes one dense, organized sheet sized to print on one or two pages."
            sourceSummary={sources || undefined}
          />
        ) : (
          <NotesWorkspace
            unitId={unit.id}
            notes={notes}
            documents={documents}
            aiReady={aiReady}
            initialNoteId={initialNoteId}
            initialPanel={initialPanel}
          />
        )}
      </div>
    </div>
  );
}
