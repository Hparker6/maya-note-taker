"use client";

import clsx from "clsx";
import { useState } from "react";
import { api } from "@/lib/client";
import { classColor } from "@/lib/colors";
import { EVENT_KINDS, type CalendarEvent, type ClassNode, type EventKind } from "@/lib/types";
import { Button, inputClass } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";
import { dayKey, eventStart, KIND_META } from "./calendar-utils";

const labelClass = "mb-1.5 block text-[13px] font-medium text-ink-2";

function timeValue(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function EventFormDialog({
  open,
  onClose,
  onSaved,
  tree,
  event,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  tree: ClassNode[];
  event?: CalendarEvent | null;
  defaultDate?: Date;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={event ? "Edit event" : "New event"}
      description={event ? undefined : "Add a lecture, exam, quiz, deadline or study session."}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="event-form">
            {event ? "Save changes" : "Add to calendar"}
          </Button>
        </>
      }
    >
      {open && <EventForm tree={tree} event={event ?? undefined} defaultDate={defaultDate} onSaved={onSaved} />}
    </Dialog>
  );
}

function EventForm({
  tree,
  event,
  defaultDate,
  onSaved,
}: {
  tree: ClassNode[];
  event?: CalendarEvent;
  defaultDate?: Date;
  onSaved: (event: CalendarEvent) => void;
}) {
  const { toast } = useFeedback();
  const start = event ? eventStart(event) : (defaultDate ?? new Date());
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "exam");
  const [classId, setClassId] = useState(event?.class_id ? String(event.class_id) : "");
  const [unitId, setUnitId] = useState(event?.unit_id ? String(event.unit_id) : "");
  const [date, setDate] = useState(dayKey(start));
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [startTime, setStartTime] = useState(event && !event.all_day ? timeValue(event.starts_at) : "09:00");
  const [endTime, setEndTime] = useState(event?.ends_at && !event.all_day ? timeValue(event.ends_at) : "");
  const [points, setPoints] = useState(event?.points?.toString() ?? "");
  const [weight, setWeight] = useState(event?.weight?.toString() ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [details, setDetails] = useState(() => {
    if (!event?.description) return "";
    const div = typeof document !== "undefined" ? document.createElement("div") : null;
    if (!div) return "";
    div.innerHTML = event.description.replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n");
    return (div.textContent ?? "").trim();
  });
  const [busy, setBusy] = useState(false);

  const units = tree.find((c) => String(c.id) === classId)?.sections.flatMap((s) => s.units.map((u) => ({ ...u, section: s.name }))) ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const localIso = (time: string) => new Date(`${date}T${time}`).toISOString();
    const body = {
      full: true,
      title,
      kind,
      class_id: classId ? Number(classId) : null,
      unit_id: unitId ? Number(unitId) : null,
      all_day: allDay,
      starts_at: allDay ? date : localIso(startTime || "09:00"),
      ends_at: allDay || !endTime ? null : localIso(endTime),
      points: points === "" ? null : Number(points),
      weight: weight === "" ? null : Number(weight),
      location,
      description: details,
    };
    setBusy(true);
    try {
      const saved = event
        ? await api<CalendarEvent>(`/api/events/${event.id}`, { method: "PATCH", json: body })
        : await api<CalendarEvent>("/api/events", { json: body });
      toast(event ? "Event updated" : "Added to your calendar");
      onSaved(saved);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save the event", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="event-form" onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="event-title">
          Title
        </label>
        <input
          id="event-title"
          autoFocus
          required
          maxLength={200}
          className={inputClass}
          placeholder="Midterm exam"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <span className={labelClass}>Type</span>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_KINDS.map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
                  kind === k ? "border-transparent font-medium text-white" : "border-line text-ink-2 hover:bg-hover",
                )}
                style={kind === k ? { background: meta.color } : undefined}
              >
                <Icon className="size-3.5" style={kind === k ? undefined : { color: meta.color }} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Class</span>
          <select
            className={inputClass}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setUnitId("");
            }}
          >
            <option value="">No class</option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Covers unit</span>
          <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!classId}>
            <option value="">{classId ? "Not specific" : "Pick a class first"}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.section} › {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {classId && (
        <div className="-mt-1 flex items-center gap-1.5 text-xs text-ink-3">
          <span className="size-2 rounded-full" style={{ background: classColor(tree.find((c) => String(c.id) === classId)?.color ?? "") }} />
          Linking a unit shows its notes and study sheet on the event.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" required className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>Starts</span>
          <input type="time" className={inputClass} value={startTime} disabled={allDay} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>Ends</span>
          <input type="time" className={inputClass} value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        All day / due that day
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Points</span>
          <input type="number" min={0} step="any" inputMode="decimal" className={inputClass} placeholder="100" value={points} onChange={(e) => setPoints(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>% of final grade</span>
          <input type="number" min={0} max={100} step="any" inputMode="decimal" className={inputClass} placeholder="25" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>Location</span>
          <input className={inputClass} maxLength={200} placeholder="Room 204 / Zoom" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Details</span>
        <textarea
          rows={3}
          maxLength={20000}
          className={clsx(inputClass, "h-auto py-2")}
          placeholder="Chapters 1–4, closed book, bring a calculator…"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </label>
    </form>
  );
}
