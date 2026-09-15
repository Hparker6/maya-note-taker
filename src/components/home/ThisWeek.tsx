"use client";

import { CalendarDays, RefreshCw } from "lucide-react";
import Link from "next/link";
import { classColor } from "@/lib/colors";
import type { CalendarEvent } from "@/lib/types";
import { useHydrated } from "@/lib/useStorage";
import { eventStart, formatPoints, formatTime, formatWeight, KIND_META, relativeDay } from "../calendar/calendar-utils";
import { useShell } from "../shell/ShellContext";

/** Upcoming deadlines and classes on the home page. Dates render in the viewer's timezone. */
export function ThisWeek({ events, canvasConnected }: { events: CalendarEvent[]; canvasConnected: boolean }) {
  const { tree } = useShell();
  const hydrated = useHydrated();
  const upcoming = hydrated ? events.filter((e) => eventStart(e).getTime() >= new Date().setHours(0, 0, 0, 0)).slice(0, 6) : [];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold tracking-tight">This week</h2>
        <Link href="/calendar" className="text-sm text-ink-3 hover:text-ink">
          Open calendar →
        </Link>
      </div>
      {!hydrated ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sunken" />
      ) : upcoming.length ? (
        <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
          {upcoming.map((e) => {
            const meta = KIND_META[e.kind];
            const klass = e.class_id ? tree.find((c) => c.id === e.class_id) : undefined;
            const worth = [formatPoints(e.points), e.weight !== null ? `≈${formatWeight(e.weight)}` : null].filter(Boolean).join(" · ");
            return (
              <li key={e.id} className="border-b border-line last:border-0">
                <Link href="/calendar" className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-hover">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: klass ? classColor(klass.color) : meta.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    <span className="block truncate text-xs text-ink-3">
                      <span style={{ color: meta.color }}>{meta.label}</span>
                      {klass ? ` · ${klass.code || klass.name}` : ""}
                      {worth ? ` · ${worth}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] leading-tight text-ink-3">
                    <span className="block font-medium text-ink-2 capitalize">{relativeDay(e)}</span>
                    {e.all_day ? "due" : formatTime({ ...e, ends_at: null })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">
          <CalendarDays className="mx-auto mb-2 size-5" />
          Nothing due in the next week.
          {!canvasConnected && (
            <Link href="/calendar" className="mt-2 flex items-center justify-center gap-1.5 font-medium text-accent hover:underline">
              <RefreshCw className="size-3.5" /> Connect Canvas
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
