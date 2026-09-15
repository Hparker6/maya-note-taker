import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ClassView } from "@/components/views/ClassView";
import { getClass, getTree } from "@/lib/repo";

type Props = { params: Promise<{ classId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const klass = getClass(Number((await params).classId));
  return { title: klass?.name ?? "Class" };
}

export default async function ClassPage({ params }: Props) {
  await connection();
  const id = Number((await params).classId);
  const klass = getTree().find((c) => c.id === id);
  if (!klass) notFound();
  return <ClassView klass={klass} />;
}
