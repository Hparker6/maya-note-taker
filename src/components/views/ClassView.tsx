"use client";

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  FolderPlus,
  GraduationCap,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Share2,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { classColor } from "@/lib/colors";
import type { ClassNode } from "@/lib/types";
import { Breadcrumbs, PageTitle } from "../PageHeader";
import { useShell } from "../shell/ShellContext";
import { useTreeActions } from "../shell/useTreeActions";
import { Button, buttonClass } from "../ui/Button";
import { Menu } from "../ui/Menu";

export function ClassView({ klass }: { klass: ClassNode }) {
  const { openClassDialog, openUpload, openShare } = useShell();
  const actions = useTreeActions();
  const color = classColor(klass.color);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: klass.name }]} />
      <div className="mt-4">
        <PageTitle
          eyebrow={
            <span
              className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase"
              style={{ background: `color-mix(in oklab, ${color} 13%, transparent)`, color }}
            >
              <GraduationCap className="size-3.5" />
              {klass.code || "Class"}
            </span>
          }
          actions={
            <>
              <Button onClick={() => openShare({ scope: "class", id: klass.id, title: klass.name })}>
                <Share2 /> Share
              </Button>
              <Button onClick={() => openClassDialog(klass)}>
                <Pencil /> Edit class
              </Button>
              <Button variant="primary" onClick={() => actions.addSection(klass)}>
                <FolderPlus /> Add section
              </Button>
              <Menu
                triggerClassName={buttonClass("ghost", "icon")}
                trigger={<MoreHorizontal />}
                items={[{ label: "Delete class", icon: <Trash2 />, danger: true, onSelect: () => actions.deleteClass(klass, true) }]}
              />
            </>
          }
        >
          {klass.name}
        </PageTitle>
      </div>

      {!klass.sections.length ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border-2 border-dashed border-line-strong px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-sunken text-ink-2">
            <FolderPlus className="size-5" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight">Add your first section</h2>
          <p className="mt-2 max-w-md text-[15px] text-ink-3">
            Sections mirror how the course is split up — modules, weeks, or exam blocks. Each section holds units of PDFs and notes.
          </p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => actions.addSection(klass)}>
            <Plus /> Add section
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {klass.sections.map((s, si) => {
            return (
              <section key={s.id} className="rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
                <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                  <Link href={`/sections/${s.id}`} className="min-w-0 hover:underline">
                    <h2 className="truncate font-serif text-lg font-semibold tracking-tight">{s.name}</h2>
                  </Link>
                  <span className="text-xs text-ink-3">
                    {s.units.length} unit{s.units.length === 1 ? "" : "s"}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Link href={`/sections/${s.id}`} className={buttonClass("ghost", "sm")}>
                      <Sparkles /> Exam review
                    </Link>
                    <Menu
                      triggerClassName={buttonClass("ghost", "icon-sm")}
                      trigger={<MoreHorizontal />}
                      items={[
                        { label: "Rename section", icon: <Pencil />, onSelect: () => actions.renameSection(s) },
                        { label: "Add unit", icon: <Plus />, onSelect: () => actions.addUnit(s) },
                        { label: "Move up", icon: <ArrowUp />, onSelect: () => actions.move("sections", s.id, "up"), disabled: si === 0, separatorBefore: true },
                        { label: "Move down", icon: <ArrowDown />, onSelect: () => actions.move("sections", s.id, "down"), disabled: si === klass.sections.length - 1 },
                        { label: "Delete section", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => actions.deleteSection(s) },
                      ]}
                    />
                  </div>
                </header>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {s.units.map((u) => (
                    <div
                      key={u.id}
                      className="group relative rounded-xl border border-line bg-paper/60 p-4 transition-all hover:border-line-strong hover:bg-card hover:shadow-soft"
                    >
                      <Link href={`/units/${u.id}`} className="absolute inset-0 rounded-xl" aria-label={`Open ${u.name}`} />
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium leading-snug">{u.name}</h3>
                        {u.has_sheet && (
                          <span title="Study sheet ready" className="shrink-0 text-accent">
                            <CheckCircle2 className="size-4" />
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-[12.5px] text-ink-3">
                        <span className="flex items-center gap-1">
                          <FileText className="size-3.5" /> {u.doc_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <NotebookPen className="size-3.5" /> {u.note_count}
                        </span>
                        <button
                          onClick={() => openUpload({ unitId: u.id })}
                          className="relative z-10 ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-hover hover:text-ink focus:opacity-100"
                        >
                          <UploadCloud className="size-3.5" /> Upload
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => actions.addUnit(s)}
                    className="flex min-h-[92px] items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm text-ink-3 transition-colors hover:border-accent hover:text-accent"
                  >
                    <Plus className="size-4" /> Add unit
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
