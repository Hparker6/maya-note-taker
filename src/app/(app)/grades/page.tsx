import type { Metadata } from "next";
import { connection } from "next/server";
import { GradesView } from "@/components/grades/GradesView";
import { maybeAutoSync } from "@/lib/canvas";
import { listCourseGrades } from "@/lib/grades";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage() {
  await connection();
  maybeAutoSync();
  return <GradesView courses={listCourseGrades()} />;
}
