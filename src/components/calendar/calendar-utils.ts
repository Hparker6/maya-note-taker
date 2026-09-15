import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileWarning,
  ListChecks,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { CalendarEvent, EventKind } from "@/lib/types";

export const KIND_META: Record<EventKind, { label: string; plural: string; color: string; icon: LucideIcon }> = {
  exam: { label: "Exam", plural: "exams", color: "var(--tc-red)", icon: FileWarning },
  quiz: { label: "Quiz", plural: "quizzes", color: "var(--tc-orange)", icon: ListChecks },
  assignment: { label: "Assignment", plural: "assignments", color: "var(--tc-blue)", icon: ClipboardList },
  lecture: { label: "Lecture", plural: "lectures", color: "var(--tc-green)", icon: Presentation },
  study: { label: "Study session", plural: "study sessions", color: "var(--tc-purple)", icon: BookOpen },
  other: { label: "Event", plural: "events", color: "var(--tc-gray)", icon: CalendarDays },
};

export const KIND_ORDER: EventKind[] = ["exam", "quiz", "assignment", "lecture", "study", "other"];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** YYYY-MM-DD in the viewer's timezone. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local start of an event (all-day dates are local midnight). */
export function eventStart(e: Pick<CalendarEvent, "starts_at" | "all_day">) {
  return e.all_day ? parseDayKey(e.starts_at.slice(0, 10)) : new Date(e.starts_at);
}

/** Every local day an event touches (multi-day all-day events span several). */
export function eventDayKeys(e: CalendarEvent): string[] {
  const start = eventStart(e);
  if (!e.all_day || !e.ends_at) return [dayKey(start)];
  const keys: string[] = [];
  const end = parseDayKey(e.ends_at.slice(0, 10));
  for (let d = start; d <= end && keys.length < 62; d = addDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

export function formatTime(e: Pick<CalendarEvent, "starts_at" | "ends_at" | "all_day">) {
  if (e.all_day) return "All day";
  const start = new Date(e.starts_at);
  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return e.ends_at ? `${fmt(start)} – ${fmt(new Date(e.ends_at))}` : fmt(start);
}

export function formatLongDate(e: Pick<CalendarEvent, "starts_at" | "ends_at" | "all_day">) {
  const start = eventStart(e);
  const date = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (e.all_day && e.ends_at) {
    const end = parseDayKey(e.ends_at.slice(0, 10));
    return `${date} – ${end.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`;
  }
  return `${date} · ${formatTime(e)}`;
}

/** "in 3 days", "tomorrow", "2 days ago". */
export function relativeDay(e: Pick<CalendarEvent, "starts_at" | "all_day">, now = new Date()) {
  const diff = Math.round((startOfDay(eventStart(e)).getTime() - startOfDay(now).getTime()) / 86400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

export function formatWeight(weight: number | null) {
  if (weight === null || weight === undefined) return null;
  return `${weight < 1 ? weight.toFixed(1) : weight < 10 ? weight.toFixed(1).replace(/\.0$/, "") : Math.round(weight)}%`;
}

export function formatPoints(points: number | null) {
  if (points === null || points === undefined) return null;
  return `${Number.isInteger(points) ? points : points.toFixed(1)} pt${points === 1 ? "" : "s"}`;
}

export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  graded: { label: "Graded", color: "var(--tc-green)" },
  submitted: { label: "Submitted", color: "var(--tc-green)" },
  late: { label: "Submitted late", color: "var(--tc-orange)" },
  missing: { label: "Missing", color: "var(--tc-red)" },
  excused: { label: "Excused", color: "var(--tc-gray)" },
};
