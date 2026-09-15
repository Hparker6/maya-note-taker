import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UnitView, type UnitTab } from "@/components/views/UnitView";
import { aiConfigured } from "@/lib/ai";
import { isRunning } from "@/lib/jobs";
import { getUnitContext, listDocumentsWithStatus, listNotes } from "@/lib/repo";
import { sheetState } from "@/lib/sheets";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ tab?: string; note?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ctx = getUnitContext(Number((await params).unitId));
  return { title: ctx ? `${ctx.unit.name} · ${ctx.klass.name}` : "Unit" };
}

export default async function UnitPage({ params, searchParams }: Props) {
  await connection();
  const id = Number((await params).unitId);
  const ctx = getUnitContext(id);
  if (!ctx) notFound();
  const { tab, note } = await searchParams;

  const documents = listDocumentsWithStatus(id).map((d) => ({ ...d, condensing: isRunning("document", d.id) }));
  const notes = listNotes(id);
  const sheet = sheetState("unit", id);
  const defaultTab: UnitTab = sheet.sheet || sheet.running ? "sheet" : "pdfs";
  const initialTab: UnitTab = tab === "sheet" || tab === "pdfs" || tab === "notes" ? tab : defaultTab;

  return (
    <UnitView
      key={id}
      ctx={ctx}
      documents={documents}
      notes={notes}
      sheet={sheet}
      aiReady={aiConfigured()}
      initialTab={initialTab}
      initialNoteId={note ? Number(note) : undefined}
    />
  );
}
