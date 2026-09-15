import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SectionView } from "@/components/views/SectionView";
import { aiConfigured } from "@/lib/ai";
import { getClass, getSection, getTree } from "@/lib/repo";
import { sheetState } from "@/lib/sheets";

type Props = { params: Promise<{ sectionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getSection(Number((await params).sectionId))?.name ?? "Section" };
}

export default async function SectionPage({ params }: Props) {
  await connection();
  const id = Number((await params).sectionId);
  const section = getSection(id);
  const klass = section && getClass(section.class_id);
  const node = klass && getTree().find((c) => c.id === klass.id)?.sections.find((s) => s.id === id);
  if (!section || !klass || !node) notFound();

  return <SectionView key={id} klass={klass} section={node} sheet={sheetState("section", id)} aiReady={aiConfigured()} />;
}
