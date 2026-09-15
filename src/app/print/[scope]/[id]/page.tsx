import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PrintView } from "@/components/views/PrintView";
import { getClass, getDocument, getSection, getSheet, getUnitContext } from "@/lib/repo";
import type { SheetScope } from "@/lib/types";

type Props = { params: Promise<{ scope: string; id: string }> };

function describe(scope: SheetScope, id: number) {
  if (scope === "document") {
    const doc = getDocument(id);
    const ctx = doc && getUnitContext(doc.unit_id);
    return doc && ctx ? { title: doc.title, context: `${ctx.klass.name} › ${ctx.section.name} › ${ctx.unit.name}`, back: `/documents/${id}` } : null;
  }
  if (scope === "unit") {
    const ctx = getUnitContext(id);
    return ctx ? { title: ctx.unit.name, context: `${ctx.klass.name} › ${ctx.section.name}`, back: `/units/${id}?tab=sheet` } : null;
  }
  const section = getSection(id);
  const klass = section && getClass(section.class_id);
  return section && klass ? { title: `${section.name} — Exam review`, context: klass.name, back: `/sections/${id}` } : null;
}

function parse(scope: string, id: string): { scope: SheetScope; id: number } | null {
  if (scope !== "document" && scope !== "unit" && scope !== "section") return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? { scope, id: n } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const parsed = parse(p.scope, p.id);
  const info = parsed && describe(parsed.scope, parsed.id);
  return { title: info ? `${info.title} (print)` : "Print" };
}

export default async function PrintPage({ params }: Props) {
  await connection();
  const p = await params;
  const parsed = parse(p.scope, p.id);
  const info = parsed && describe(parsed.scope, parsed.id);
  const sheet = parsed && getSheet(parsed.scope, parsed.id);
  if (!parsed || !info || !sheet) notFound();

  return <PrintView title={info.title} context={info.context} backHref={info.back} html={sheet.content} updatedAt={sheet.updated_at} />;
}
