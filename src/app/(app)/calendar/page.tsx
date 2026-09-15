import type { Metadata } from "next";
import { connection } from "next/server";
import { CalendarView } from "@/components/calendar/CalendarView";
import { canvasStatus, maybeAutoSync } from "@/lib/canvas";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  await connection();
  maybeAutoSync();
  return <CalendarView initialCanvas={canvasStatus()} />;
}
