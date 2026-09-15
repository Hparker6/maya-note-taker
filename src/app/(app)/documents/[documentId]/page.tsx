import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ensureImports } from "@/lib/imports";
import { getDocument, getImportNote } from "@/lib/repo";

type Props = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ panel?: string }>;
};

/** PDFs live inside the unit's notes now; old links land on the PDF's note. */
export default async function DocumentPage({ params, searchParams }: Props) {
  await connection();
  const doc = getDocument(Number((await params).documentId));
  if (!doc) notFound();
  await ensureImports(doc.unit_id);
  const note = getImportNote(doc.id);
  const { panel } = await searchParams;
  const query = new URLSearchParams({ tab: "notes" });
  if (note) query.set("note", String(note.id));
  if (panel === "sheet" || panel === "pdf") query.set("panel", panel);
  redirect(`/units/${doc.unit_id}?${query}`);
}
