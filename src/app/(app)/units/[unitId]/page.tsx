import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UnitView, type UnitTab } from "@/components/views/UnitView";
import { aiConfigured } from "@/lib/ai";
import { ensureImports } from "@/lib/imports";
import { isRunning, isTaskRunning, transcriptKey } from "@/lib/jobs";
import { getUnitContext, listDocuments, listNotes } from "@/lib/repo";
import { sheetState } from "@/lib/sheets";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ tab?: string; note?: string; panel?: string }>;
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
  await ensureImports(id);
  const { tab, note, panel } = await searchParams;

  const documents = listDocuments(id).map((d) => ({
    ...d,
    condensing: isRunning("document", d.id),
    transcribing: isTaskRunning(transcriptKey(d.id)),
    sheet: sheetState("document", d.id),
  }));
  const initialTab: UnitTab = tab === "sheet" ? "sheet" : "notes";

  return (
    <UnitView
      key={id}
      ctx={ctx}
      documents={documents}
      notes={listNotes(id)}
      sheet={sheetState("unit", id)}
      aiReady={aiConfigured()}
      initialTab={initialTab}
      initialNoteId={note ? Number(note) : undefined}
      initialPanel={panel === "pdf" || panel === "sheet" ? panel : undefined}
    />
  );
}
