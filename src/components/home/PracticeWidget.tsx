"use client";

import clsx from "clsx";
import { Brain, Flame } from "lucide-react";
import Link from "next/link";
import type { PracticeStats, StreakInfo } from "@/lib/types";
import { useShell } from "../shell/ShellContext";

export function PracticeWidget({ totals, streak }: { totals: PracticeStats; streak: StreakInfo }) {
  const { startStudy } = useShell();
  const waiting = totals.due + totals.new;
  const goal = Math.min(100, Math.round((streak.xpToday / streak.goal) * 100));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight">Practice</h2>
        <Link href="/practice" className="text-[13px] font-medium text-accent hover:underline">
          Open
        </Link>
      </div>
      <div className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "grid size-11 place-items-center rounded-xl",
              streak.practicedToday ? "bg-[color-mix(in_oklab,var(--tc-orange)_16%,transparent)] text-[var(--tc-orange)]" : "bg-sunken text-ink-3",
            )}
          >
            <Flame className={clsx("size-6", streak.practicedToday && "fill-current")} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {streak.streak} day streak
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-[var(--tc-orange)]" style={{ width: `${goal}%` }} />
            </div>
            <div className="mt-1 text-[11.5px] text-ink-3">
              {streak.xpToday}/{streak.goal} XP today
            </div>
          </div>
        </div>
        {totals.total > 0 ? (
          <button
            onClick={() => startStudy({ mode: waiting ? "review" : "quiz" })}
            className="chunky mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-[color-mix(in_oklab,var(--success)_70%,black)] bg-success text-[14px] font-bold tracking-wide text-white uppercase dark:text-[#0e1a15]"
          >
            <Brain className="size-4" /> {waiting ? `Review ${waiting} card${waiting === 1 ? "" : "s"}` : "Quick quiz"}
          </button>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">
            Turn your notes into flashcards from any unit&apos;s <span className="font-medium text-ink-2">Practice</span> tab.
          </p>
        )}
      </div>
    </section>
  );
}
