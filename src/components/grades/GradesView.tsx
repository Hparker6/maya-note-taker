"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowUpRight, Award, KeyRound, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { classColor } from "@/lib/colors";
import type { CanvasStatus, CourseGrade, GradeItem } from "@/lib/types";
import { useHydrated } from "@/lib/useStorage";
import { RelativeTime } from "../RelativeTime";
import { useShell } from "../shell/ShellContext";
import { Button, Spinner } from "../ui/Button";
import { useFeedback } from "../ui/feedback";

/** Rounds for display and drops trailing zeros: 38.10 → "38.1", 20.00 → "20". */
const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "–" : String(Number(n.toFixed(digits))));

/** Color for a percentage: green when strong, orange when shaky, red when failing. */
function scoreColor(pct: number | null) {
  if (pct === null) return "var(--ink-3)";
  if (pct >= 85) return "var(--success)";
  if (pct >= 70) return "var(--tc-orange)";
  return "var(--danger)";
}

export function GradesView({ courses }: { courses: CourseGrade[] }) {
  const { canvas, openCanvas } = useShell();
  const router = useRouter();
  const { toast } = useFeedback();
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const status = await api<CanvasStatus>("/api/canvas/sync", { method: "POST" });
      if (status.lastSync) toast(status.lastSync.message, status.lastSync.ok ? "success" : "error");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">Grades</h1>
          <p className="mt-1 text-[15px] text-ink-3">
            {canvas.hasToken && canvas.lastSyncAt ? (
              <>
                From Canvas · <RelativeTime iso={canvas.lastSyncAt} prefix="synced " />
              </>
            ) : (
              "Your scores, what each assignment is worth, and where each class stands."
            )}
          </p>
        </div>
        {canvas.hasToken && (
          <Button onClick={sync} disabled={syncing}>
            {syncing ? <Spinner className="size-3.5" /> : <RefreshCw />} Sync now
          </Button>
        )}
        <Button variant="ghost" onClick={openCanvas}>
          <Settings2 /> Canvas settings
        </Button>
      </div>

      {!canvas.hasToken ? (
        <div className="mt-8 rounded-3xl border border-line bg-card p-6 shadow-soft sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <KeyRound className="size-6" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight">Bring in your grades from Canvas</h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-3">
            {canvas.connected
              ? "Your calendar feed brings in due dates, but not scores. Add a Canvas access token to see every score, how much each assignment is worth toward your final grade, and your grade in each class."
              : "Connect Canvas with an access token to see every score, how much each assignment is worth toward your final grade, and your grade in each class."}
          </p>
          <ol className="mt-4 space-y-1.5 text-[14px] text-ink-2">
            <li>
              1. In Canvas, open <strong>Account → Settings</strong>.
            </li>
            <li>
              2. Under <strong>Approved Integrations</strong>, click <strong>+ New Access Token</strong> and copy it.
            </li>
            <li>
              3. Paste it with your school&apos;s Canvas address in <strong>Canvas settings</strong>.
            </li>
          </ol>
          <Button variant="primary" size="lg" className="mt-6" onClick={openCanvas}>
            <KeyRound /> Add Canvas token
          </Button>
        </div>
      ) : !courses.length ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
          <Award className="mx-auto size-8 text-ink-3" />
          <p className="mt-3 font-medium">No grades yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">Sync Canvas to pull in your courses and scores.</p>
          <Button className="mt-4" onClick={sync} disabled={syncing}>
            {syncing ? <Spinner className="size-3.5" /> : <RefreshCw />} Sync now
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.course_key} course={course} />
            ))}
          </div>
          <div className="mt-12 space-y-10">
            {courses.map((course) => (
              <CourseDetail key={course.course_key} course={course} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const courseAnchor = (key: string) => `course-${key.replace(/[^a-z0-9]+/gi, "-")}`;

function GradeBar({ course, className }: { course: CourseGrade; className?: string }) {
  const earned = Math.min(100, course.earned_weight);
  const lost = Math.max(0, Math.min(100 - earned, course.graded_weight - course.earned_weight));
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full bg-success" style={{ width: `${earned}%` }} />
        <div className="h-full bg-[color-mix(in_oklab,var(--danger)_55%,transparent)]" style={{ width: `${lost}%` }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11.5px] text-ink-3">
        <span>
          <span className="font-semibold text-success">{fmt(course.earned_weight)}%</span> earned
        </span>
        {lost > 0 && (
          <span>
            <span className="font-semibold text-danger">{fmt(lost)}%</span> lost
          </span>
        )}
        <span>{fmt(Math.max(0, 100 - course.graded_weight))}% still to come</span>
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: CourseGrade }) {
  const color = classColor(course.class_color ?? "slate");
  return (
    <a
      href={`#${courseAnchor(course.course_key)}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-soft"
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: course.class_color ? color : "var(--line-strong)" }} />
      <div className="truncate text-xs font-semibold tracking-wide text-ink-3 uppercase">{course.class_name ? course.label : "Canvas course"}</div>
      <div className="mt-0.5 truncate font-serif text-lg font-semibold tracking-tight">{course.class_name ?? course.label}</div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-serif text-4xl font-semibold tabular-nums" style={{ color: scoreColor(course.current_score) }}>
          {course.current_score === null ? "–" : `${fmt(course.current_score)}%`}
        </span>
        {course.current_grade && <span className="rounded-md bg-sunken px-2 py-0.5 text-sm font-bold text-ink-2">{course.current_grade}</span>}
      </div>
      <div className="mt-0.5 text-xs text-ink-3">
        {course.current_score === null ? "Nothing graded yet" : `Current grade · ${fmt(course.graded_weight)}% of the course is graded`}
      </div>
      <GradeBar course={course} className="mt-4" />
    </a>
  );
}

function statusChip(item: GradeItem, hydrated: boolean) {
  const pastDue = hydrated && item.due_at ? new Date(item.due_at).getTime() < Date.now() : false;
  const map: Record<string, [string, string]> = {
    graded: ["Graded", "bg-sunken text-ink-2"],
    submitted: ["Submitted", "bg-[color-mix(in_oklab,var(--tc-blue)_14%,transparent)] text-[var(--tc-blue)]"],
    late: ["Late", "bg-[color-mix(in_oklab,var(--tc-orange)_15%,transparent)] text-[var(--tc-orange)]"],
    missing: ["Missing", "bg-danger-soft text-danger"],
    excused: ["Excused", "bg-sunken text-ink-3"],
  };
  const [label, cls] = map[item.status] ?? (pastDue ? ["Not submitted", "bg-[color-mix(in_oklab,var(--tc-orange)_15%,transparent)] text-[var(--tc-orange)]"] : ["Upcoming", "bg-sunken text-ink-3"]);
  return <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", cls)}>{label}</span>;
}

const dueLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No due date");

function CourseDetail({ course }: { course: CourseGrade }) {
  const hydrated = useHydrated();
  const color = course.class_color ? classColor(course.class_color) : "var(--line-strong)";
  return (
    <section id={courseAnchor(course.course_key)} className="scroll-mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-3 rounded-full" style={{ background: color }} />
        <h2 className="min-w-0 flex-1 truncate font-serif text-2xl font-semibold tracking-tight">{course.class_name ?? course.label}</h2>
        <span className="font-serif text-2xl font-semibold tabular-nums" style={{ color: scoreColor(course.current_score) }}>
          {course.current_score === null ? "–" : `${fmt(course.current_score)}%`}
          {course.current_grade && <span className="ml-2 text-base text-ink-2">{course.current_grade}</span>}
        </span>
        {course.class_id && (
          <Link href={`/classes/${course.class_id}`} className="text-[13px] font-medium text-accent hover:underline">
            Open class
          </Link>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">
        {course.weighted ? "Weighted by assignment group" : "Graded by total points"}
        {course.final_score !== null && course.final_score !== course.current_score && ` · ${fmt(course.final_score)}% if nothing else were turned in`}
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
        {course.groups.map((group) => (
          <div key={group.name} className="border-b border-line last:border-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-paper/60 px-4 py-2.5">
              <span className="font-semibold">{group.name || "Assignments"}</span>
              {group.weight !== null && <span className="rounded-md bg-sunken px-1.5 py-0.5 text-xs font-medium text-ink-2">{fmt(group.weight)}% of grade</span>}
              <span className="ml-auto text-sm font-semibold tabular-nums" style={{ color: scoreColor(group.percent) }}>
                {group.percent === null ? "Not graded yet" : `${fmt(group.percent)}%`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed text-[13.5px]">
                <colgroup>
                  <col />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col className="w-36" />
                  <col className="w-20" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="text-left text-[11px] tracking-wide text-ink-3 uppercase">
                    <th className="px-4 py-2 font-semibold">Assignment</th>
                    <th className="px-2 py-2 font-semibold">Due</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 text-right font-semibold">Score</th>
                    <th className="px-2 py-2 text-right font-semibold" title="Share of your final grade this assignment is worth">
                      Worth
                    </th>
                    <th className="px-4 py-2 text-right font-semibold" title="Share of your final grade you earned on it">
                      Earned
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => {
                    const pct = item.score !== null && item.points_possible ? (100 * item.score) / item.points_possible : null;
                    const earned = pct !== null && item.weight ? (item.weight * pct) / 100 : null;
                    return (
                      <tr key={item.key} className={clsx("border-t border-line", !item.counts && "opacity-60")}>
                        <td className="px-4 py-2.5">
                          <a href={item.url} target="_blank" rel="noreferrer" className="group inline-flex max-w-full items-center gap-1 font-medium hover:text-accent">
                            <span className="truncate">{item.name}</span>
                            <ArrowUpRight className="size-3.5 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" />
                          </a>
                          {!item.counts && <div className="text-[11px] text-ink-3">Doesn&apos;t count toward the final grade</div>}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-ink-3">{dueLabel(item.due_at)}</td>
                        <td className="px-2 py-2.5">{statusChip(item, hydrated)}</td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap tabular-nums">
                          {item.score !== null ? (
                            <>
                              <span className="font-semibold">{fmt(item.score, 2)}</span>
                              <span className="text-ink-3">/{fmt(item.points_possible, 2)}</span>
                              {pct !== null && (
                                <span className="ml-1.5 text-xs font-semibold" style={{ color: scoreColor(pct) }}>
                                  {fmt(pct)}%
                                </span>
                              )}
                            </>
                          ) : item.points_possible ? (
                            <span className="text-ink-3">–/{fmt(item.points_possible, 2)}</span>
                          ) : (
                            <span className="text-ink-3">{item.grade || "–"}</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{item.weight !== null && item.counts ? `${fmt(item.weight, 2)}%` : "–"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {earned !== null && item.status !== "excused" ? (
                            <span className={clsx(earned < item.weight! - 0.005 && "text-ink-2")}>{fmt(earned, 2)}%</span>
                          ) : (
                            <span className="text-ink-3">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {course.groups.some((g) => g.items.some((i) => i.status === "missing")) && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-danger">
          <AlertTriangle className="size-4" /> Some work is marked missing in Canvas.
        </p>
      )}
    </section>
  );
}
