import clsx from "clsx";
import type { PracticeStats } from "@/lib/types";

export const LEVEL_COLORS = {
  new: "var(--line-strong)",
  learning: "var(--tc-orange)",
  known: "var(--tc-blue)",
  mastered: "var(--success)",
};

/** Segmented bar: how much of a deck is new, learning, familiar, mastered. */
export function MasteryBar({ stats, className, legend = false }: { stats: PracticeStats; className?: string; legend?: boolean }) {
  const segments = [
    { key: "mastered", label: "Mastered", value: stats.mastered },
    { key: "known", label: "Familiar", value: stats.known },
    { key: "learning", label: "Learning", value: stats.learning },
    { key: "new", label: "New", value: stats.new },
  ] as const;
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken" aria-label={`${stats.mastered} mastered, ${stats.known} familiar, ${stats.learning} learning, ${stats.new} new`}>
        {stats.total > 0 &&
          segments.map((s) =>
            s.value ? <div key={s.key} className="h-full transition-[width] duration-500" style={{ width: `${(s.value / stats.total) * 100}%`, background: LEVEL_COLORS[s.key] }} /> : null,
          )}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          {segments.map((s) => (
            <span key={s.key} className={clsx("flex items-center gap-1.5", !s.value && "opacity-60")}>
              <span className="size-2 rounded-full" style={{ background: LEVEL_COLORS[s.key] }} />
              {s.label} <span className="font-semibold text-ink-2 tabular-nums">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
