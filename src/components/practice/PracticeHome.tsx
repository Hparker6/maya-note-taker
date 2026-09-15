"use client";

import clsx from "clsx";
import { ArrowRight, Brain, CalendarClock, Check, Flame, Layers, ListChecks, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { classColor } from "@/lib/colors";
import type { PracticeStats, StreakInfo, UnitPracticeSummary } from "@/lib/types";
import { useHydrated } from "@/lib/useStorage";
import { useShell } from "../shell/ShellContext";
import { Button } from "../ui/Button";
import { MasteryBar } from "./MasteryBar";

export interface UpcomingTest {
  id: number;
  title: string;
  kind: string;
  startsAt: string;
  allDay: boolean;
  classId: number | null;
  className: string | null;
  classColor: string | null;
  hasDeck: boolean;
}

interface Suggestion {
  unitId: number;
  unitName: string;
  className: string;
  classColor: string;
  items: number;
}

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" });

export function PracticeHome({
  totals,
  streak,
  summaries,
  upcoming,
  suggestions,
  hasClasses,
}: {
  totals: PracticeStats;
  streak: StreakInfo;
  summaries: UnitPracticeSummary[];
  upcoming: UpcomingTest[];
  suggestions: Suggestion[];
  hasClasses: boolean;
}) {
  const { startStudy } = useShell();
  const waiting = totals.due + totals.new;

  const classes = summaries.reduce<{ id: number; name: string; color: string; units: UnitPracticeSummary[] }[]>((groups, s) => {
    let group = groups.find((g) => g.id === s.classId);
    if (!group) groups.push((group = { id: s.classId, name: s.className, color: s.classColor, units: [] }));
    group.units.push(s);
    return groups;
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">Practice</h1>
      <p className="mt-1 text-[15px] text-ink-3">A few minutes a day beats an all-nighter. Cards you miss come back sooner.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <DailyCard totals={totals} waiting={waiting} onReview={() => startStudy({ mode: "review" })} onQuiz={() => startStudy({ mode: "quiz" })} />
        <StreakCard streak={streak} />
      </div>

      {upcoming.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
            <CalendarClock className="size-5 text-[var(--tc-red)]" /> Coming up
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
                <span
                  className="w-1 self-stretch rounded-full"
                  style={{ background: t.classColor ? classColor(t.classColor) : "var(--line-strong)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-px text-[10.5px] font-bold uppercase",
                        t.kind === "exam" ? "bg-danger-soft text-danger" : "bg-[color-mix(in_oklab,var(--tc-orange)_15%,transparent)] text-[var(--tc-orange)]",
                      )}
                    >
                      {t.kind}
                    </span>
                    <Countdown iso={t.startsAt} allDay={t.allDay} />
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium">{t.title}</div>
                  {t.className && <div className="truncate text-xs text-ink-3">{t.className}</div>}
                </div>
                {t.hasDeck && t.classId ? (
                  <Button size="sm" variant="primary" onClick={() => startStudy({ mode: "quiz", classId: t.classId! })}>
                    <ListChecks /> Quiz
                  </Button>
                ) : (
                  <Link href="/calendar" className="text-xs font-medium text-accent hover:underline">
                    Details
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 font-serif text-xl font-semibold tracking-tight">Your decks</h2>
        {classes.length ? (
          <div className="space-y-6">
            {classes.map((c) => {
              const due = c.units.reduce((n, u) => n + u.stats.due + u.stats.new, 0);
              const cards = c.units.reduce((n, u) => n + u.stats.total, 0);
              return (
                <div key={c.id} className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper/60 px-4 py-3">
                    <span className="size-2.5 rounded-full" style={{ background: classColor(c.color) }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    <span className="text-xs text-ink-3">
                      {cards} card{cards === 1 ? "" : "s"}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => startStudy({ mode: "quiz", classId: c.id })}>
                      <ListChecks /> Quiz class
                    </Button>
                    <Button size="sm" onClick={() => startStudy({ mode: due ? "review" : "cram", classId: c.id })} disabled={!cards}>
                      <Layers /> {due ? `Review ${due}` : "Cram"}
                    </Button>
                  </div>
                  <ul className="divide-y divide-line">
                    {c.units.map((u) => {
                      const unitDue = u.stats.due + u.stats.new;
                      return (
                        <li key={u.unitId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                          <Link href={`/units/${u.unitId}?tab=practice`} className="group min-w-0 sm:w-56">
                            <div className="truncate text-sm font-medium group-hover:text-accent">{u.unitName}</div>
                            <div className="truncate text-xs text-ink-3">{u.sectionName}</div>
                          </Link>
                          <div className="min-w-0 flex-1">
                            <MasteryBar stats={u.stats} />
                            <div className="mt-1 flex gap-3 text-[11.5px] text-ink-3">
                              <span>{u.stats.total} cards</span>
                              {u.questions > 0 && <span>{u.questions} questions</span>}
                              <span>{Math.round(((u.stats.known + u.stats.mastered) / Math.max(1, u.stats.total)) * 100)}% solid</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="ghost" onClick={() => startStudy({ mode: "quiz", unitId: u.unitId })} disabled={u.stats.total < 4 && !u.questions}>
                              Quiz
                            </Button>
                            <Button
                              size="sm"
                              variant={unitDue ? "primary" : "secondary"}
                              onClick={() => startStudy({ mode: unitDue ? "review" : "cram", unitId: u.unitId })}
                              disabled={!u.stats.total}
                              className="min-w-24"
                            >
                              {unitDue ? `Review ${unitDue}` : "Cram"}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <Brain className="mx-auto size-8 text-ink-3" />
            <p className="mt-3 font-medium">No flashcards yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">
              {hasClasses
                ? "Open a unit, go to its Practice tab, and make cards from your notes (free) or with AI."
                : "Create a class and add some notes first — then turn them into flashcards and quizzes."}
            </p>
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-serif text-lg font-semibold tracking-tight">Make cards for</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.unitId}>
                <Link
                  href={`/units/${s.unitId}?tab=practice`}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-line-strong hover:bg-hover"
                >
                  <span className="size-2 rounded-full" style={{ background: classColor(s.classColor) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.unitName}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {s.className} · {s.items} lecture{s.items === 1 ? "" : "s"} & notes
                    </span>
                  </span>
                  <Sparkles className="size-4 text-ink-3 group-hover:text-accent" />
                  <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DailyCard({ totals, waiting, onReview, onQuiz }: { totals: PracticeStats; waiting: number; onReview: () => void; onQuiz: () => void }) {
  const caughtUp = totals.total > 0 && waiting === 0;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-card p-6 shadow-soft">
      <div className="pointer-events-none absolute -top-10 -right-10 size-44 rounded-full bg-[color-mix(in_oklab,var(--success)_12%,transparent)]" />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-semibold text-success">
          <Target className="size-4" /> Daily review
        </div>
        {totals.total === 0 ? (
          <>
            <p className="mt-3 font-serif text-2xl font-semibold tracking-tight">Build your first deck</p>
            <p className="mt-1 max-w-sm text-sm text-ink-3">Flashcards come from your notes — no typing required.</p>
          </>
        ) : caughtUp ? (
          <>
            <p className="mt-3 flex items-center gap-2 font-serif text-2xl font-semibold tracking-tight">
              All caught up <Check className="size-6 text-success" />
            </p>
            <p className="mt-1 text-sm text-ink-3">Nothing due today. A quick quiz keeps it fresh.</p>
          </>
        ) : (
          <>
            <p className="mt-3 font-serif text-4xl font-semibold tracking-tight tabular-nums">{waiting}</p>
            <p className="mt-1 text-sm text-ink-3">
              card{waiting === 1 ? "" : "s"} waiting across your classes
              {totals.due && totals.new ? ` — ${totals.due} due, ${totals.new} new` : ""}
            </p>
          </>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {totals.total > 0 && !caughtUp && (
            <button
              onClick={onReview}
              className="chunky inline-flex h-12 items-center gap-2 rounded-2xl border-[color-mix(in_oklab,var(--success)_70%,black)] bg-success px-6 text-[15px] font-bold tracking-wide text-white uppercase dark:text-[#0e1a15]"
            >
              <Layers className="size-5" /> Start review
            </button>
          )}
          {totals.total >= 4 && (
            <button
              onClick={onQuiz}
              className={clsx(
                "chunky inline-flex h-12 items-center gap-2 rounded-2xl px-6 text-[15px] font-bold tracking-wide uppercase",
                caughtUp
                  ? "border-[color-mix(in_oklab,var(--tc-blue)_70%,black)] bg-[var(--tc-blue)] text-white dark:text-[#0c1420]"
                  : "border-line-strong bg-card text-ink-2 hover:bg-hover",
              )}
            >
              <ListChecks className="size-5" /> Quiz me
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StreakCard({ streak }: { streak: StreakInfo }) {
  const pct = Math.min(1, streak.xpToday / streak.goal);
  const r = 30;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="rounded-3xl border border-line bg-card p-6 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="relative grid size-[76px] shrink-0 place-items-center">
          <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90">
            <circle cx="38" cy="38" r={r} fill="none" stroke="var(--sunken)" strokeWidth="8" />
            <circle
              cx="38"
              cy="38"
              r={r}
              fill="none"
              stroke="var(--tc-orange)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)}
              className="transition-[stroke-dashoffset] duration-700"
            />
          </svg>
          <Flame className={clsx("size-8", streak.practicedToday ? "fill-current text-[var(--tc-orange)]" : "text-ink-3")} />
        </div>
        <div className="min-w-0">
          <div className="font-serif text-3xl font-semibold tabular-nums">
            {streak.streak} <span className="text-lg font-medium text-ink-3">day{streak.streak === 1 ? "" : "s"}</span>
          </div>
          <div className="text-sm text-ink-3">
            {streak.practicedToday
              ? streak.xpToday >= streak.goal
                ? "Goal done for today!"
                : `${streak.goal - streak.xpToday} XP to today's goal`
              : streak.streak
                ? "Practice today to keep your streak"
                : "Start a streak today"}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-between">
        {streak.week.map((d, i) => {
          const isToday = i === streak.week.length - 1;
          return (
            <div key={d.day} className="flex flex-col items-center gap-1.5">
              <span className={clsx("text-[11px] font-semibold", isToday ? "text-ink" : "text-ink-3")}>{WEEKDAY.format(new Date(`${d.day}T12:00:00Z`))}</span>
              <span
                className={clsx(
                  "grid size-8 place-items-center rounded-full border-2",
                  d.xp > 0 ? "border-[var(--tc-orange)] bg-[var(--tc-orange)] text-white dark:text-[#1a1208]" : isToday ? "border-dashed border-line-strong" : "border-line",
                )}
                title={d.xp ? `${d.xp} XP` : "No practice"}
              >
                {d.xp > 0 && <Check className="size-4 stroke-[3]" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Countdown({ iso, allDay }: { iso: string; allDay: boolean }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const date = allDay ? new Date(`${iso.slice(0, 10)}T00:00:00`) : new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86400_000);
  const label = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return <span className={clsx("text-xs font-semibold", days <= 2 ? "text-danger" : "text-ink-3")}>{label}</span>;
}
