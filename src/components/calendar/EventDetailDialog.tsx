"use client";

import clsx from "clsx";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  MapPin,
  NotebookPen,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { classColor } from "@/lib/colors";
import { EVENT_KINDS, type CalendarEvent, type ClassNode, type EventKind, type NoteKind } from "@/lib/types";
import { useAutosave } from "@/lib/useAutosave";
import { SaveIndicator } from "../SaveIndicator";
import { Button, buttonClass, inputClass, Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";
import { formatLongDate, formatPoints, formatWeight, KIND_META, relativeDay, STATUS_LABEL } from "./calendar-utils";

interface UnitOverview {
  unit: { id: number; name: string };
  section: { id: number; name: string };
  notes: { id: number; title: string; kind: NoteKind }[];
  has_sheet: boolean;
  section_has_sheet: boolean;
}

export function EventDetailDialog({
  event,
  tree,
  onClose,
  onChange,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent | null;
  tree: ClassNode[];
  onClose: () => void;
  onChange: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const meta = event ? KIND_META[event.kind] : null;
  const klass = event?.class_id ? tree.find((c) => c.id === event.class_id) : undefined;

  return (
    <Dialog
      open={Boolean(event)}
      onClose={onClose}
      size="lg"
      title={event?.title}
      description={
        event &&
        meta && (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: `color-mix(in oklab, ${meta.color} 14%, transparent)`, color: meta.color }}
            >
              <meta.icon className="size-3.5" /> {meta.label}
            </span>
            {klass && (
              <Link href={`/classes/${klass.id}`} className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:underline">
                <span className="size-2 rounded-full" style={{ background: classColor(klass.color) }} />
                {klass.code || klass.name}
              </Link>
            )}
            <span className="text-xs text-ink-2">
              {formatLongDate(event)} <span className="text-ink-3">({relativeDay(event)})</span>
            </span>
          </span>
        )
      }
    >
      {event && <EventBody key={event.id} event={event} tree={tree} onChange={onChange} onEdit={onEdit} onDelete={onDelete} />}
    </Dialog>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper/60 px-3.5 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{label}</div>
      <div className="mt-0.5 font-serif text-xl font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="truncate text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

function EventBody({
  event,
  tree,
  onChange,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  tree: ClassNode[];
  onChange: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const { toast } = useFeedback();
  const [notes, setNotes] = useState(event.my_notes);
  const [overview, setOverview] = useState<{ unitId: number; data: UnitOverview } | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    try {
      const updated = await api<CalendarEvent>(`/api/events/${event.id}`, { method: "PATCH", json: body });
      onChange(updated);
      return updated;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't update the event", "error");
    }
  };

  const saver = useAutosave(async (value: string) => {
    const updated = await api<CalendarEvent>(`/api/events/${event.id}`, { method: "PATCH", json: { my_notes: value } });
    onChange(updated);
  }, 800);

  useEffect(() => {
    if (!event.unit_id) return;
    const controller = new AbortController();
    const unitId = event.unit_id;
    api<UnitOverview>(`/api/units/${unitId}`, { signal: controller.signal })
      .then((data) => setOverview({ unitId, data }))
      .catch(() => {});
    return () => controller.abort();
  }, [event.unit_id]);

  const klass = event.class_id ? tree.find((c) => c.id === event.class_id) : undefined;
  const units = klass?.sections.flatMap((s) => s.units.map((u) => ({ ...u, section: s.name }))) ?? [];
  const status = STATUS_LABEL[event.submission_status];
  const unitOverview = overview && overview.unitId === event.unit_id ? overview.data : null;
  const hasCanvasExtras = event.points !== null || event.group_name;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Points" value={formatPoints(event.points) ?? "—"} sub={event.score !== null ? `Scored ${event.score}` : undefined} />
        <Stat
          label="Of final grade"
          value={event.weight !== null ? `≈${formatWeight(event.weight)}` : "—"}
          sub={event.weight !== null && event.source === "canvas" ? "estimated" : undefined}
        />
        <Stat
          label="Category"
          value={event.group_weight !== null ? `${formatWeight(event.group_weight)}` : "—"}
          sub={event.group_name || undefined}
        />
        <Stat label="Status" value={event.done ? "Done" : status?.label ?? "To do"} color={event.done ? "var(--tc-green)" : status?.color} />
      </div>
      {event.source === "canvas" && !hasCanvasExtras && (
        <p className="-mt-2 text-xs text-ink-3">
          Points and grade weights come from Canvas when you add an access token in <strong>Canvas sync</strong>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={event.done ? "secondary" : "primary"} size="sm" onClick={() => patch({ done: !event.done })}>
          {event.done ? <Circle /> : <CheckCircle2 />} {event.done ? "Mark not done" : "Mark done"}
        </Button>
        {event.url && (
          <a href={event.url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            <ExternalLink /> Open in Canvas
          </a>
        )}
        {event.source === "manual" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(event)}>
              <Pencil /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onDelete(event)}>
              <Trash2 /> Delete
            </Button>
          </>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-3">
            <RefreshCw className="size-3" /> Synced from Canvas
          </span>
        )}
        {event.location && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
            <MapPin className="size-3.5" /> {event.location}
          </span>
        )}
      </div>

      <section className="rounded-2xl border border-line p-4">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-base font-semibold">
          <Sparkles className="size-4 text-accent" /> Study for this
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={inputClass} value={event.kind} onChange={(e) => patch({ kind: e.target.value as EventKind })} aria-label="Type">
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={event.class_id ?? ""}
            onChange={(e) => patch({ class_id: e.target.value ? Number(e.target.value) : null })}
            aria-label="Class"
          >
            <option value="">No class</option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={event.unit_id ?? ""}
            disabled={!klass}
            onChange={(e) => patch({ unit_id: e.target.value ? Number(e.target.value) : null })}
            aria-label="Unit it covers"
          >
            <option value="">{klass ? "Which unit does it cover?" : "Pick a class first"}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.section} › {u.name}
              </option>
            ))}
          </select>
        </div>

        {event.unit_id && !unitOverview && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-3">
            <Spinner className="size-3.5" /> Loading study materials…
          </div>
        )}
        {unitOverview && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Link href={`/units/${unitOverview.unit.id}?tab=sheet`} className={buttonClass(unitOverview.has_sheet ? "primary" : "secondary", "sm")}>
                <Sparkles /> {unitOverview.has_sheet ? "Open study sheet" : "Build study sheet"}
              </Link>
              <Link href={`/sections/${unitOverview.section.id}`} className={buttonClass("secondary", "sm")}>
                <Sparkles /> {unitOverview.section_has_sheet ? "Exam review" : "Section review"} · {unitOverview.section.name}
              </Link>
            </div>
            {unitOverview.notes.length > 0 ? (
              <ul className="grid gap-1 sm:grid-cols-2">
                {unitOverview.notes.slice(0, 10).map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/units/${unitOverview.unit.id}?tab=notes&note=${n.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
                    >
                      {n.kind === "import" ? <FileText className="size-4 shrink-0 text-danger/80" /> : <NotebookPen className="size-4 shrink-0 text-accent" />}
                      <span className="truncate">{n.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">No notes in {unitOverview.unit.name} yet.</p>
            )}
          </div>
        )}
        {!event.unit_id && (
          <p className="mt-3 text-xs text-ink-3">Pick the unit this covers to see its lectures, your notes and the study sheet right here.</p>
        )}
      </section>

      {event.description && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-3 uppercase">{event.source === "canvas" ? "From Canvas" : "Details"}</h3>
          <div className="rich rich-note max-h-72 overflow-y-auto rounded-xl border border-line bg-paper/50 px-4 py-3 !text-[14px]" dangerouslySetInnerHTML={{ __html: event.description }} />
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wider text-ink-3 uppercase">My notes</h3>
          <SaveIndicator status={saver.status} onRetry={() => void saver.flush()} />
        </div>
        <textarea
          rows={3}
          value={notes}
          maxLength={50000}
          onChange={(e) => {
            setNotes(e.target.value);
            saver.schedule(e.target.value);
          }}
          placeholder="What's on it, what to bring, what the professor hinted…"
          className={clsx(inputClass, "h-auto py-2.5 leading-relaxed")}
        />
      </section>
    </div>
  );
}
