import type { Metadata } from "next";
import { connection } from "next/server";
import { PracticeHome } from "@/components/practice/PracticeHome";
import { upcomingTests } from "@/lib/calendar";
import { today } from "@/lib/day";
import { practiceSummaries, streakInfo, totalStats } from "@/lib/practice";
import { getTree } from "@/lib/repo";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage() {
  await connection();
  const day = await today();
  const tree = getTree();
  const summaries = practiceSummaries(day);
  const withDecks = new Set(summaries.map((s) => s.unitId));

  const classNames = new Map(tree.map((c) => [c.id, { name: c.name, color: c.color }]));
  const upcoming = upcomingTests().map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      startsAt: e.starts_at,
      allDay: e.all_day,
      classId: e.class_id,
      className: e.class_id ? (classNames.get(e.class_id)?.name ?? null) : null,
      classColor: e.class_id ? (classNames.get(e.class_id)?.color ?? null) : null,
      hasDeck: Boolean(e.class_id && summaries.some((s) => s.classId === e.class_id)),
    }));

  // Units with material but no practice yet — nudges to make cards.
  const suggestions = tree.flatMap((c) =>
    c.sections.flatMap((s) =>
      s.units
        .filter((u) => !withDecks.has(u.id) && u.doc_count + u.note_count > 0)
        .map((u) => ({ unitId: u.id, unitName: u.name, className: c.name, classColor: c.color, items: u.doc_count + u.note_count })),
    ),
  );

  return (
    <PracticeHome
      totals={totalStats(day)}
      streak={streakInfo(day)}
      summaries={summaries}
      upcoming={upcoming}
      suggestions={suggestions.slice(0, 8)}
      hasClasses={tree.length > 0}
    />
  );
}
