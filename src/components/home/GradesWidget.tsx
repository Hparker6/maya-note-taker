import Link from "next/link";
import { classColor } from "@/lib/colors";
import type { CourseGrade } from "@/lib/types";

const pctColor = (pct: number | null) => (pct === null ? "var(--ink-3)" : pct >= 85 ? "var(--success)" : pct >= 70 ? "var(--tc-orange)" : "var(--danger)");

export function GradesWidget({ courses }: { courses: CourseGrade[] }) {
  if (!courses.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Grades</h2>
        <Link href="/grades" className="text-[13px] font-medium text-accent hover:underline">
          Details
        </Link>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
        {courses.map((c) => (
          <li key={c.course_key} className="border-b border-line last:border-0">
            <Link href="/grades" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.class_color ? classColor(c.class_color) : "var(--line-strong)" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.class_name ?? c.label}</span>
                <span className="block text-[11.5px] text-ink-3">{c.graded_weight}% graded</span>
              </span>
              <span className="text-right">
                <span className="block font-serif text-lg font-semibold tabular-nums" style={{ color: pctColor(c.current_score) }}>
                  {c.current_score === null ? "–" : `${c.current_score}%`}
                </span>
                {c.current_grade && <span className="block text-[11px] font-bold text-ink-3">{c.current_grade}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
