import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActiveUnit } from "@/components/shell/AppShell";
import { DocumentView } from "@/components/views/DocumentView";
import { aiConfigured } from "@/lib/ai";
import { getDocument, getUnitContext, listDocumentNotes } from "@/lib/repo";
import { sheetState } from "@/lib/sheets";

type Props = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ panel?: string; note?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getDocument(Number((await params).documentId))?.title ?? "PDF" };
}

export default async function DocumentPage({ params, searchParams }: Props) {
  await connection();
  const doc = getDocument(Number((await params).documentId));
  const ctx = doc && getUnitContext(doc.unit_id);
  if (!doc || !ctx) notFound();
  const { panel, note } = await searchParams;

  return (
    <>
      <ActiveUnit id={ctx.unit.id} />
      <DocumentView
        key={doc.id}
        doc={doc}
        ctx={ctx}
        sheet={sheetState("document", doc.id)}
        notes={listDocumentNotes(doc.id)}
        aiReady={aiConfigured()}
        initialPanel={panel === "notes" ? "notes" : "sheet"}
        initialNoteId={note ? Number(note) : undefined}
      />
    </>
  );
}
