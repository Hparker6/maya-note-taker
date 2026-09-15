"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  NotebookPen,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { classColor } from "@/lib/colors";
import type { CalendarEvent, CanvasStatus, ClassNode } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useHydrated, useLocalStorage } from "@/lib/useStorage";
import { useShell } from "../shell/ShellContext";
import { Button, Spinner } from "../ui/Button";
import { useFeedback } from "../ui/feedback";
import {
  addDays,
  dayKey,
  eventDayKeys,
  eventStart,
  formatPoints,
  formatTime,
  formatWeight,
  KIND_META,
  KIND_ORDER,
  parseDayKey,
  startOfMonth,
  startOfWeek,
} from "./calendar-utils";
import { CanvasDialog } from "./CanvasDialog";
import { EventDetailDialog } from "./EventDetailDialog";
import { EventFormDialog } from "./EventFormDialog";

interface DayNote {
  id: number;
  title: string;
  kind: "note" | "import";
  unit_id: number;
  class_id: number;
  created_at: string;
}

type View = "week" | "month";

function EventCard({
  event,
  klass,
  onOpen,
  onToggleDone,
  compact = false,
}: {
  event: CalendarEvent;
  klass?: ClassNode;
  onOpen: () => void;
  onToggleDone: () => void;
  compact?: boolean;
}) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const points = formatPoints(event.points);
  const weight = formatWeight(event.weight);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={clsx(
        "group relative cursor-pointer rounded-lg border border-line bg-card text-left shadow-[var(--shadow-sm)] transition-all hover:border-line-strong hover:shadow-soft focus-visible:outline-2",
        compact ? "px-2.5 py-2" : "px-2 py-1.5",
        event.done && "opacity-60",
      )}
      style={{ borderLeft: `3px solid ${klass ? classColor(klass.color) : meta.color}` }}
    >
      <div className="flex items-center gap-1 text-[10.5px] font-semibold tracking-wide uppercase" style={{ color: meta.color }}>
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{meta.label}</span>
        <span className="ml-auto shrink-0 font-normal tracking-normal text-ink-3 normal-case">{event.all_day ? "Due" : formatTime({ ...event, ends_at: null })}</span>
      </div>
      <div className={clsx("mt-0.5 line-clamp-2 pr-4 text-[12.5px] leading-snug font-medium text-ink", event.done && "text-ink-3 line-through")}>{event.title}</div>
      {(points || weight || klass) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-ink-3">
          {klass && <span className="truncate">{klass.code || klass.name}</span>}
          {points && <span className="font-medium text-ink-2">{points}</span>}
          {weight && <span className="rounded bg-sunken px-1 font-medium text-ink-2">≈{weight}</span>}
        </div>
      )}
      <button
        type="button"
        aria-label={event.done ? "Mark not done" : "Mark done"}
        title={event.done ? "Mark not done" : "Mark done"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        className={clsx(
          "absolute top-6 right-1.5 grid size-4 place-items-center rounded-full border transition-opacity",
          event.done ? "border-transparent bg-accent text-accent-ink opacity-100" : "border-line-strong opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        {event.done && <Check className="size-3" />}
      </button>
    </div>
  );
}

function NoteChip({ note }: { note: DayNote }) {
  return (
    <Link
      href={`/units/${note.unit_id}?tab=notes&note=${note.id}`}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      title={note.kind === "import" ? "Lecture added" : "Note taken"}
    >
      {note.kind === "import" ? <FileText className="size-3 shrink-0 text-danger/70" /> : <NotebookPen className="size-3 shrink-0 text-accent" />}
      <span className="truncate">{note.title || "Untitled note"}</span>
    </Link>
  );
}

export function CalendarView({ initialCanvas }: { initialCanvas: CanvasStatus }) {
  const router = useRouter();
  const { tree } = useShell();
  const { toast, confirm } = useFeedback();
  const hydrated = useHydrated();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [storedView, setStoredView] = useLocalStorage("calendar:view");
  const view: View = storedView === "month" ? "month" : "week";

  const [focusKey, setFocusKey] = useState<string | null>(null);
  const todayKey = hydrated ? dayKey(new Date()) : null;
  const focus = focusKey ?? todayKey;

  const [canvas, setCanvas] = useState(initialCanvas);
  // Canvas can also be connected or synced from the sidebar; follow the fresh server status.
  const canvasSignature = `${initialCanvas.lastSync?.at ?? ""}|${initialCanvas.feedUrl ?? ""}|${initialCanvas.tokenHint ?? ""}|${initialCanvas.courses.length}`;
  const [seenCanvas, setSeenCanvas] = useState(canvasSignature);
  const [data, setData] = useState<{ key: string; events: CalendarEvent[]; notes: DayNote[] } | null>(null);
  const [reload, setReload] = useState(0);
  const [hiddenClasses, setHiddenClasses] = useState<Set<number>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<{ event?: CalendarEvent; date?: Date } | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  if (seenCanvas !== canvasSignature) {
    setSeenCanvas(canvasSignature);
    setCanvas(initialCanvas);
    setReload((r) => r + 1);
  }

  const range = useMemo(() => {
    if (!focus) return null;
    const date = parseDayKey(focus);
    const start = view === "week" ? startOfWeek(date) : startOfWeek(startOfMonth(date));
    const days = view === "week" ? 7 : 42;
    return { start, end: addDays(start, days), days: Array.from({ length: days }, (_, i) => addDays(start, i)) };
  }, [focus, view]);
  const rangeKey = range ? `${range.start.toISOString()}|${range.end.toISOString()}|${reload}` : "";

  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    const key = rangeKey;
    api<{ events: CalendarEvent[]; notes: DayNote[] }>(
      `/api/events?from=${encodeURIComponent(addDays(range.start, -1).toISOString())}&to=${encodeURIComponent(addDays(range.end, 1).toISOString())}`,
      { signal: controller.signal },
    )
      .then((res) => setData({ key, ...res }))
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  // Follow a background Canvas sync until it finishes, then show its results.
  useEffect(() => {
    if (!canvas.syncing) return;
    const timer = setInterval(async () => {
      try {
        const next = await api<CanvasStatus>("/api/canvas");
        if (!next.syncing) {
          setCanvas(next);
          setReload((r) => r + 1);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [canvas.syncing]);

  const classesById = useMemo(() => new Map(tree.map((c) => [c.id, c])), [tree]);
  const loading = !data || data.key !== rangeKey;

  const visible = (data?.events ?? []).filter((e) => !(e.class_id && hiddenClasses.has(e.class_id)) && !(hideDone && e.done));
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) for (const key of eventDayKeys(e)) map.set(key, [...(map.get(key) ?? []), e]);
    for (const list of map.values())
      list.sort((a, b) => Number(b.all_day) - Number(a.all_day) || eventStart(a).getTime() - eventStart(b).getTime());
    return map;
  }, [visible]);
  const notesByDay = useMemo(() => {
    const map = new Map<string, DayNote[]>();
    for (const n of data?.notes ?? []) {
      if (hiddenClasses.has(n.class_id)) continue;
      const key = dayKey(new Date(n.created_at));
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [data, hiddenClasses]);

  const updateEvent = useCallback((updated: CalendarEvent) => {
    setData((d) => (d ? { ...d, events: d.events.map((e) => (e.id === updated.id ? updated : e)) } : d));
    setOpenEvent((o) => (o && o.id === updated.id ? updated : o));
  }, []);

  const toggleDone = async (event: CalendarEvent) => {
    updateEvent({ ...event, done: !event.done });
    try {
      updateEvent(await api<CalendarEvent>(`/api/events/${event.id}`, { method: "PATCH", json: { done: !event.done } }));
    } catch (err) {
      updateEvent(event);
      toast(err instanceof Error ? err.message : "Couldn't update", "error");
    }
  };

  const deleteEvent = async (event: CalendarEvent) => {
    const ok = await confirm({ title: `Delete “${event.title}”?`, confirmLabel: "Delete event", danger: true });
    if (!ok) return;
    await api(`/api/events/${event.id}`, { method: "DELETE" });
    setOpenEvent(null);
    setData((d) => (d ? { ...d, events: d.events.filter((e) => e.id !== event.id) } : d));
    toast("Event deleted");
  };

  const shift = (dir: -1 | 1) => {
    if (!focus) return;
    const date = parseDayKey(focus);
    setFocusKey(dayKey(view === "week" ? addDays(date, dir * 7) : new Date(date.getFullYear(), date.getMonth() + dir, 1)));
  };

  const title = useMemo(() => {
    if (!range || !focus) return " ";
    if (view === "month") return parseDayKey(focus).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const last = addDays(range.start, 6);
    const sameMonth = last.getMonth() === range.start.getMonth();
    const startLabel = range.start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endLabel = last.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
    return `${startLabel} – ${endLabel}, ${last.getFullYear()}`;
  }, [range, focus, view]);

  const weekSummary = useMemo(() => {
    if (!range || view !== "week") return null;
    const inWeek = visible.filter((e) => {
      const start = eventStart(e);
      return start >= range.start && start < range.end;
    });
    const counts = KIND_ORDER.map((k) => [k, inWeek.filter((e) => e.kind === k).length] as const).filter(([, n]) => n > 0);
    const points = inWeek.reduce((s, e) => s + (e.points ?? 0), 0);
    const weight = inWeek.reduce((s, e) => s + (e.weight ?? 0), 0);
    return { counts, points, weight, total: inWeek.length, done: inWeek.filter((e) => e.done).length };
  }, [range, view, visible]);

  const connected = Boolean(canvas.feedUrl || canvas.tokenHint);
  const openCreate = (date?: Date) => setForm({ date: date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9) : undefined });

  const dayHeader = (day: Date, big = false) => {
    const isToday = dayKey(day) === todayKey;
    return (
      <div className={clsx("flex items-center gap-1.5", big ? "text-sm" : "text-xs")}>
        <span className={clsx("font-semibold tracking-wide uppercase", isToday ? "text-accent" : "text-ink-3")}>
          {day.toLocaleDateString(undefined, { weekday: big ? "long" : "short" })}
        </span>
        <span
          className={clsx(
            "grid place-items-center rounded-full font-semibold tabular-nums",
            big ? "size-7 text-sm" : "size-6 text-[12.5px]",
            isToday ? "bg-accent text-accent-ink" : "text-ink",
          )}
        >
          {day.getDate()}
        </span>
        {big && <span className="text-ink-3">{day.toLocaleDateString(undefined, { month: "short" })}</span>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-[220px] font-serif text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => setFocusKey(null)}>
            Today
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => shift(1)} aria-label="Next">
            <ChevronRight />
          </Button>
          {loading && <Spinner className="ml-1 size-4 text-ink-3" />}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-card p-0.5 text-[13px]">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setStoredView(v)}
                className={clsx("rounded-md px-3 py-1 capitalize", view === v ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink")}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setCanvasOpen(true)}>
            {canvas.syncing ? (
              <Spinner className="size-3.5" />
            ) : connected && canvas.lastSync?.ok === false ? (
              <AlertTriangle className="text-[var(--tc-orange)]" />
            ) : (
              <RefreshCw className={connected ? "text-accent" : undefined} />
            )}
            {connected ? "Canvas" : "Connect Canvas"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => openCreate(focus ? parseDayKey(focus) : undefined)}>
            <Plus /> New event
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {tree.map((c) => {
          const hidden = hiddenClasses.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() =>
                setHiddenClasses((prev) => {
                  const next = new Set(prev);
                  if (hidden) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                })
              }
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors",
                hidden ? "border-line text-ink-3 line-through opacity-60" : "border-line bg-card text-ink-2 hover:bg-hover",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: classColor(c.color) }} />
              {c.code || c.name}
            </button>
          );
        })}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-3">
          <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide done
        </label>
      </div>

      {weekSummary && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card px-4 py-3 text-[13.5px] shadow-[var(--shadow-sm)]">
          <span className="font-medium">This week</span>
          {weekSummary.total === 0 ? (
            <span className="text-ink-3">Nothing scheduled.</span>
          ) : (
            <>
              {weekSummary.counts.map(([kind, n]) => (
                <span key={kind} className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: KIND_META[kind].color }} />
                  {n} {n === 1 ? KIND_META[kind].label.toLowerCase() : KIND_META[kind].plural}
                </span>
              ))}
              {weekSummary.points > 0 && <span className="text-ink-2">{formatPoints(weekSummary.points)} on the line</span>}
              {weekSummary.weight > 0 && <span className="rounded-md bg-sunken px-1.5 py-0.5 font-medium text-ink">≈{formatWeight(weekSummary.weight)} of your grades</span>}
              <span className="ml-auto text-xs text-ink-3">
                {weekSummary.done}/{weekSummary.total} done
              </span>
            </>
          )}
        </div>
      )}

      {!connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm">
          <RefreshCw className="size-4 text-accent" />
          <span className="min-w-0 flex-1 text-ink-2">Connect Canvas to bring in every assignment, quiz and exam automatically.</span>
          <Button size="sm" variant="primary" onClick={() => setCanvasOpen(true)}>
            Connect Canvas
          </Button>
        </div>
      )}

      {!range ? (
        <div className="mt-4 h-[480px] animate-pulse rounded-2xl bg-sunken" />
      ) : view === "week" && isDesktop ? (
        <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
          {range.days.map((day) => {
            const key = dayKey(day);
            const events = byDay.get(key) ?? [];
            const notes = notesByDay.get(key) ?? [];
            return (
              <div key={key} className={clsx("group/day flex min-h-[460px] flex-col border-r border-line last:border-r-0", key === todayKey && "bg-accent-soft/30")}>
                <div className="flex items-center justify-between border-b border-line px-2.5 py-2">
                  {dayHeader(day)}
                  <button
                    onClick={() => openCreate(day)}
                    className="grid size-6 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-hover hover:text-ink"
                    aria-label={`Add event on ${day.toDateString()}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                  {events.map((e) => (
                    <EventCard
                      key={`${e.id}-${key}`}
                      event={e}
                      klass={e.class_id ? classesById.get(e.class_id) : undefined}
                      onOpen={() => setOpenEvent(e)}
                      onToggleDone={() => toggleDone(e)}
                    />
                  ))}
                  {notes.length > 0 && (
                    <div className={clsx(events.length > 0 && "mt-1 border-t border-line pt-1")}>
                      {notes.map((n) => (
                        <NoteChip key={n.id} note={n} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "week" ? (
        <div className="mt-4 space-y-3">
          {range.days.map((day) => {
            const key = dayKey(day);
            const events = byDay.get(key) ?? [];
            const notes = notesByDay.get(key) ?? [];
            return (
              <section key={key} className={clsx("rounded-2xl border border-line bg-card p-3", key === todayKey && "ring-2 ring-accent/30")}>
                <div className="mb-2 flex items-center justify-between">
                  {dayHeader(day, true)}
                  <Button size="icon-sm" variant="ghost" onClick={() => openCreate(day)} aria-label="Add event">
                    <Plus />
                  </Button>
                </div>
                {events.length === 0 && notes.length === 0 ? (
                  <p className="px-1 text-[13px] text-ink-3">Nothing scheduled</p>
                ) : (
                  <div className="space-y-1.5">
                    {events.map((e) => (
                      <EventCard
                        key={e.id}
                        compact
                        event={e}
                        klass={e.class_id ? classesById.get(e.class_id) : undefined}
                        onOpen={() => setOpenEvent(e)}
                        onToggleDone={() => toggleDone(e)}
                      />
                    ))}
                    {notes.map((n) => (
                      <NoteChip key={n.id} note={n} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-sm)]">
          <div className="grid grid-cols-7 border-b border-line">
            {range.days.slice(0, 7).map((d) => (
              <div key={d.getDay()} className="px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                {d.toLocaleDateString(undefined, { weekday: isDesktop ? "short" : "narrow" })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {range.days.map((day) => {
              const key = dayKey(day);
              const events = byDay.get(key) ?? [];
              const inMonth = focus ? day.getMonth() === parseDayKey(focus).getMonth() : true;
              const shown = isDesktop ? 3 : 2;
              return (
                <div
                  key={key}
                  className={clsx(
                    "min-h-[104px] border-r border-b border-line p-1 [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-sunken/50",
                  )}
                >
                  <button
                    onClick={() => {
                      setFocusKey(key);
                      setStoredView("week");
                    }}
                    className={clsx(
                      "mb-0.5 grid size-6 place-items-center rounded-full text-[12px] font-medium tabular-nums hover:bg-hover",
                      key === todayKey ? "bg-accent text-accent-ink hover:bg-accent" : inMonth ? "text-ink" : "text-ink-3",
                    )}
                  >
                    {day.getDate()}
                  </button>
                  <div className="space-y-0.5">
                    {events.slice(0, shown).map((e) => {
                      const meta = KIND_META[e.kind];
                      const klass = e.class_id ? classesById.get(e.class_id) : undefined;
                      return (
                        <button
                          key={`${e.id}-${key}`}
                          onClick={() => setOpenEvent(e)}
                          className={clsx("flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-hover", e.done && "text-ink-3 line-through")}
                        >
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: klass ? classColor(klass.color) : meta.color }} />
                          <span className="truncate">{e.title}</span>
                        </button>
                      );
                    })}
                    {events.length > shown && (
                      <button
                        onClick={() => {
                          setFocusKey(key);
                          setStoredView("week");
                        }}
                        className="px-1 text-[11px] font-medium text-ink-3 hover:text-ink"
                      >
                        +{events.length - shown} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EventDetailDialog
        event={openEvent}
        tree={tree}
        onClose={() => setOpenEvent(null)}
        onChange={updateEvent}
        onEdit={(e) => {
          setOpenEvent(null);
          setForm({ event: e });
        }}
        onDelete={deleteEvent}
      />
      <EventFormDialog
        open={Boolean(form)}
        event={form?.event}
        defaultDate={form?.date}
        tree={tree}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          setFocusKey(dayKey(eventStart(saved)));
          setReload((r) => r + 1);
        }}
      />
      <CanvasDialog
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        status={canvas}
        tree={tree}
        onStatus={(next) => {
          setCanvas(next);
          setReload((r) => r + 1);
          router.refresh();
        }}
      />
    </div>
  );
}
