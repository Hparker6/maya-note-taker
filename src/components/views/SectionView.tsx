"use client";

import clsx from "clsx";
import { CheckCircle2, Circle, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { classColor } from "@/lib/colors";
import type { ClassRow, SectionNode, SheetState } from "@/lib/types";
import { Breadcrumbs } from "../PageHeader";
import { SheetPanel } from "../SheetPanel";
import { useTreeActions } from "../shell/useTreeActions";
import { Button, buttonClass } from "../ui/Button";
import { Menu } from "../ui/Menu";

export function SectionView({
  klass,
  section,
  sheet,
  aiReady,
}: {
  klass: ClassRow;
  section: SectionNode;
  sheet: SheetState;
  aiReady: boolean;
}) {
  const actions = useTreeActions();
  const ready = section.units.filter((u) => u.has_sheet).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper px-6 pt-6 pb-4 sm:px-10">
        <Breadcrumbs items={[{ label: klass.name, href: `/classes/${klass.id}`, color: classColor(klass.color) }]} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{section.name}</h1>
            <p className="mt-1 text-sm text-ink-3">Exam review · built from the study sheets of each unit below</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => actions.addUnit(section, false)}>
              <Plus /> Add unit
            </Button>
            <Menu
              triggerClassName={buttonClass("ghost", "icon")}
              trigger={<MoreHorizontal />}
              items={[
                { label: "Rename section", icon: <Pencil />, onSelect: () => actions.renameSection(section) },
                { label: "Delete section", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => actions.deleteSection(section, true) },
              ]}
            />
          </div>
        </div>
        {section.units.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-ink-3">
              {ready}/{section.units.length} unit sheets ready
            </span>
            {section.units.map((u) => (
              <Link
                key={u.id}
                href={`/units/${u.id}?tab=sheet`}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                  u.has_sheet ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-card text-ink-3 hover:text-ink",
                )}
              >
                {u.has_sheet ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                {u.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <SheetPanel
          scope="section"
          scopeId={section.id}
          initial={sheet}
          aiReady={aiReady}
          blockedReason={ready ? undefined : "Generate at least one unit study sheet in this section first."}
          emptyTitle="Build an exam review"
          emptyBody="Claude combines every unit's study sheet into one higher-level review — the most testable ideas, connections across units, nothing wasted."
          sourceSummary={ready ? `${ready} unit sheet${ready === 1 ? "" : "s"}` : undefined}
        />
      </div>
    </div>
  );
}
