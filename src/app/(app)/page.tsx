import { FileText, Layers, NotebookPen, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Greeting, NewClassCard, WelcomeActions } from "@/components/home/HomeClient";
import { GradesWidget } from "@/components/home/GradesWidget";
import { PracticeWidget } from "@/components/home/PracticeWidget";
import { ThisWeek } from "@/components/home/ThisWeek";
import { RelativeTime } from "@/components/RelativeTime";
import { upcomingEvents } from "@/lib/calendar";
import { canvasConfigured, maybeAutoSync } from "@/lib/canvas";
import { classColor } from "@/lib/colors";
import { today } from "@/lib/day";
import { listCourseGrades } from "@/lib/grades";
import { streakInfo, totalStats } from "@/lib/practice";
import { getRecent, getStats, getTree } from "@/lib/repo";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  await connection();
  maybeAutoSync();
  const tree = getTree();
  const stats = getStats();
  const recent = getRecent(8);
  const day = await today();

  if (!tree.length) {
    return (
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium text-accent">Welcome</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          All your course notes, condensed into what actually matters.
        </h1>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-3">
          Upload the PDFs from your program, add your own notes, and get dense one-page study sheets you can edit and print.
        </p>
        <ol className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ["Create a class", "Organize it into sections and units that match your syllabus."],
            ["Upload PDFs", "Drag them in. They're searchable and viewable right away."],
            ["Study smarter", "Condense everything into printable sheets, then lock it in with flashcards and quizzes."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-sm)]">
              <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">{i + 1}</span>
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">{body}</p>
            </li>
          ))}
        </ol>
        <WelcomeActions />
      </div>
    );
  }

  const tiles = [
    { label: "Classes", value: stats.classes, icon: Layers },
    { label: "PDFs", value: stats.documents, sub: `${stats.pages.toLocaleString()} pages`, icon: FileText },
    { label: "Notes", value: stats.notes, icon: NotebookPen },
    { label: "Study sheets", value: stats.sheets, icon: Sparkles },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <Greeting />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-line bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between text-ink-3">
              <span className="text-[13px] font-medium">{label}</span>
              <Icon className="size-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-semibold tabular-nums">{value.toLocaleString()}</span>
              {sub && <span className="text-xs text-ink-3">{sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-10 xl:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-4 font-serif text-xl font-semibold tracking-tight">Your classes</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {tree.map((c) => {
              const units = c.sections.flatMap((s) => s.units);
              const docs = units.reduce((n, u) => n + u.doc_count, 0);
              const notes = units.reduce((n, u) => n + u.note_count, 0);
              const sheets = units.filter((u) => u.has_sheet).length;
              const color = classColor(c.color);
              return (
                <Link
                  key={c.id}
                  href={`/classes/${c.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft"
                >
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {c.code && (
                        <div className="text-xs font-semibold tracking-wide uppercase" style={{ color }}>
                          {c.code}
                        </div>
                      )}
                      <h3 className="mt-0.5 truncate font-serif text-lg font-semibold tracking-tight">{c.name}</h3>
                    </div>
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl font-serif text-base font-semibold"
                      style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3">
                    <span>
                      {c.sections.length} section{c.sections.length === 1 ? "" : "s"}
                    </span>
                    <span>
                      {units.length} unit{units.length === 1 ? "" : "s"}
                    </span>
                    <span>{docs} PDFs</span>
                    <span>{notes} notes</span>
                  </div>
                  {units.length > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full" style={{ width: `${(sheets / units.length) * 100}%`, background: color }} />
                      </div>
                      <div className="mt-1.5 text-[11.5px] text-ink-3">
                        {sheets} of {units.length} units have a study sheet
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
            <NewClassCard />
          </div>
        </section>

        <div className="space-y-10">
        <PracticeWidget totals={totalStats(day)} streak={streakInfo(day)} />
        <ThisWeek events={upcomingEvents(20)} canvasConnected={canvasConfigured()} />
        <GradesWidget courses={listCourseGrades()} />
        <section>
          <h2 className="mb-4 font-serif text-xl font-semibold tracking-tight">Recently</h2>
          {recent.length ? (
            <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
              {recent.map((r, i) => (
                <li key={`${r.kind}-${r.href}-${i}`} className="border-b border-line last:border-0">
                  <Link href={r.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover">
                    <span className="mt-0.5 text-ink-3 [&_svg]:size-4">
                      {r.kind === "note" ? (
                        <NotebookPen className="text-accent" />
                      ) : r.kind === "document" ? (
                        <FileText className="text-danger/80" />
                      ) : (
                        <Sparkles className="text-[var(--tc-purple)]" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-ink-3">{r.context}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      <RelativeTime iso={r.at} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">
              Upload a PDF or write a note and it&apos;ll show up here.
            </p>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
