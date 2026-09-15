import "server-only";
import { db, now } from "./db";
import type { CalendarEvent, CourseLink, EventKind } from "./types";

type EventDbRow = Omit<CalendarEvent, "all_day" | "done" | "source"> & {
  source: string;
  all_day: number;
  done: number;
  external_key: string | null;
  course_key: string;
  kind_locked: number;
  class_locked: number;
};

const toEvent = (r: EventDbRow): CalendarEvent => ({
  id: r.id,
  source: r.source === "manual" ? "manual" : "canvas",
  title: r.title,
  kind: r.kind,
  class_id: r.class_id,
  unit_id: r.unit_id,
  starts_at: r.starts_at,
  ends_at: r.ends_at,
  all_day: Boolean(r.all_day),
  location: r.location,
  description: r.description,
  url: r.url,
  points: r.points,
  weight: r.weight,
  group_name: r.group_name,
  group_weight: r.group_weight,
  course_label: r.course_label,
  submission_status: r.submission_status,
  score: r.score,
  my_notes: r.my_notes,
  done: Boolean(r.done),
  synced_at: r.synced_at,
});

/** Events overlapping [from, to). Bounds are ISO strings; all-day dates compare as strings too. */
export function listEvents(from: string, to: string): CalendarEvent[] {
  const rows = db()
    .prepare(
      `SELECT * FROM events
       WHERE starts_at < ? AND COALESCE(ends_at, starts_at) >= ?
       ORDER BY starts_at, id`,
    )
    .all(to, from.slice(0, 10)) as EventDbRow[];
  return rows.map(toEvent);
}

export function getEvent(id: number) {
  const row = db().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventDbRow | undefined;
  return row ? toEvent(row) : undefined;
}

export interface ManualEventInput {
  title: string;
  kind: EventKind;
  class_id: number | null;
  unit_id: number | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  description: string;
  points: number | null;
  weight: number | null;
}

export function createEvent(input: ManualEventInput) {
  const ts = now();
  const result = db()
    .prepare(
      `INSERT INTO events (source, title, kind, class_id, unit_id, starts_at, ends_at, all_day, location, description, points, weight, created_at, updated_at)
       VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title,
      input.kind,
      input.class_id,
      input.unit_id,
      input.starts_at,
      input.ends_at,
      input.all_day ? 1 : 0,
      input.location,
      input.description,
      input.points,
      input.weight,
      ts,
      ts,
    );
  return getEvent(Number(result.lastInsertRowid))!;
}

export function updateManualEvent(id: number, input: ManualEventInput) {
  db()
    .prepare(
      `UPDATE events SET title = ?, kind = ?, class_id = ?, unit_id = ?, starts_at = ?, ends_at = ?, all_day = ?,
         location = ?, description = ?, points = ?, weight = ?, updated_at = ? WHERE id = ? AND source = 'manual'`,
    )
    .run(
      input.title,
      input.kind,
      input.class_id,
      input.unit_id,
      input.starts_at,
      input.ends_at,
      input.all_day ? 1 : 0,
      input.location,
      input.description,
      input.points,
      input.weight,
      now(),
      id,
    );
  return getEvent(id);
}

/** Fields the student controls on any event, including ones synced from Canvas. */
export function updateEventPersonal(
  id: number,
  patch: { kind?: EventKind; class_id?: number | null; unit_id?: number | null; my_notes?: string; done?: boolean },
) {
  const columns: [string, unknown][] = [];
  if (patch.kind !== undefined) columns.push(["kind", patch.kind], ["kind_locked", 1]);
  if (patch.class_id !== undefined) columns.push(["class_id", patch.class_id], ["class_locked", 1]);
  if (patch.unit_id !== undefined) columns.push(["unit_id", patch.unit_id]);
  if (patch.my_notes !== undefined) columns.push(["my_notes", patch.my_notes]);
  if (patch.done !== undefined) columns.push(["done", patch.done ? 1 : 0]);
  if (!columns.length) return getEvent(id);
  db()
    .prepare(`UPDATE events SET ${columns.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .run(...columns.map(([, v]) => v), now(), id);
  return getEvent(id);
}

export function deleteEvent(id: number) {
  return db().prepare("DELETE FROM events WHERE id = ? AND source = 'manual'").run(id).changes > 0;
}

// ───────────────────────────── synced events ─────────────────────────────

export interface SyncedEvent {
  external_key: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  description: string;
  url: string;
  points: number | null;
  weight: number | null;
  group_name: string;
  group_weight: number | null;
  course_key: string;
  course_label: string;
  submission_status: string;
  score: number | null;
}

/**
 * Inserts or refreshes a Canvas event. Canvas-owned fields are overwritten; the student's
 * own choices (type override, class, unit, notes, done) are kept. Richer data from the API
 * is never replaced by emptier data from the calendar feed.
 */
export function upsertSyncedEvent(e: SyncedEvent, syncedAt: string, rich: boolean) {
  const d = db();
  const existing = d.prepare("SELECT id, points FROM events WHERE external_key = ?").get(e.external_key) as
    | { id: number; points: number | null }
    | undefined;
  if (!existing) {
    d.prepare(
      `INSERT INTO events (source, external_key, title, kind, starts_at, ends_at, all_day, location, description, url, points, weight,
         group_name, group_weight, course_key, course_label, submission_status, score, created_at, updated_at, synced_at)
       VALUES ('canvas', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      e.external_key,
      e.title,
      e.kind,
      e.starts_at,
      e.ends_at,
      e.all_day ? 1 : 0,
      e.location,
      e.description,
      e.url,
      e.points,
      e.weight,
      e.group_name,
      e.group_weight,
      e.course_key,
      e.course_label,
      e.submission_status,
      e.score,
      syncedAt,
      syncedAt,
      syncedAt,
    );
    return;
  }
  if (rich) {
    d.prepare(
      `UPDATE events SET title = ?, kind = CASE WHEN kind_locked = 1 THEN kind ELSE ? END, starts_at = ?, ends_at = ?, all_day = ?,
         location = ?, description = ?, url = ?, points = ?, weight = ?, group_name = ?, group_weight = ?, course_key = ?,
         course_label = ?, submission_status = ?, score = ?, synced_at = ? WHERE id = ?`,
    ).run(
      e.title,
      e.kind,
      e.starts_at,
      e.ends_at,
      e.all_day ? 1 : 0,
      e.location,
      e.description,
      e.url,
      e.points,
      e.weight,
      e.group_name,
      e.group_weight,
      e.course_key,
      e.course_label,
      e.submission_status,
      e.score,
      syncedAt,
      existing.id,
    );
  } else {
    // Calendar feed: dates, title and links only; keep API extras if present.
    d.prepare(
      `UPDATE events SET title = ?, kind = CASE WHEN kind_locked = 1 OR points IS NOT NULL THEN kind ELSE ? END,
         starts_at = ?, ends_at = ?, all_day = ?, location = ?,
         description = CASE WHEN points IS NOT NULL AND description != '' THEN description ELSE ? END,
         url = CASE WHEN url != '' THEN url ELSE ? END,
         course_key = CASE WHEN course_key != '' THEN course_key ELSE ? END,
         course_label = CASE WHEN course_label != '' THEN course_label ELSE ? END,
         synced_at = ? WHERE id = ?`,
    ).run(e.title, e.kind, e.starts_at, e.ends_at, e.all_day ? 1 : 0, e.location, e.description, e.url, e.course_key, e.course_label, syncedAt, existing.id);
  }
}

/** Removes Canvas events that no longer exist upstream, keeping any the student annotated. */
export function pruneSyncedEvents(syncStartedAt: string) {
  return db()
    .prepare("DELETE FROM events WHERE source = 'canvas' AND (synced_at IS NULL OR synced_at < ?) AND my_notes = '' AND done = 0")
    .run(syncStartedAt).changes;
}

export function removeAllSyncedEvents() {
  db().prepare("DELETE FROM events WHERE source = 'canvas'").run();
  db().prepare("DELETE FROM course_links").run();
}

export function countSyncedEvents() {
  return (db().prepare("SELECT COUNT(*) AS n FROM events WHERE source = 'canvas'").get() as { n: number }).n;
}

// ───────────────────────────── course ↔ class links ─────────────────────────────

export function listCourseLinks(): CourseLink[] {
  return db()
    .prepare(
      `SELECT l.course_key, l.label, l.class_id,
         (SELECT COUNT(*) FROM events e WHERE e.course_key = l.course_key) AS event_count
       FROM course_links l ORDER BY l.label`,
    )
    .all() as CourseLink[];
}

export function rememberCourse(courseKey: string, label: string) {
  if (!courseKey) return;
  db()
    .prepare(
      `INSERT INTO course_links (course_key, label) VALUES (?, ?)
       ON CONFLICT (course_key) DO UPDATE SET label = CASE WHEN excluded.label != '' THEN excluded.label ELSE course_links.label END`,
    )
    .run(courseKey, label);
}

export function linkCourse(courseKey: string, classId: number | null) {
  db().prepare("UPDATE course_links SET class_id = ? WHERE course_key = ?").run(classId, courseKey);
  applyCourseLinks();
}

/** Guesses a class for courses that aren't linked yet, by course code or name. */
export function autoLinkCourses() {
  const d = db();
  const classes = d.prepare("SELECT id, name, code FROM classes").all() as { id: number; name: string; code: string }[];
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const unlinked = d.prepare("SELECT course_key, label FROM course_links WHERE class_id IS NULL").all() as { course_key: string; label: string }[];
  for (const course of unlinked) {
    const label = squash(course.label);
    if (!label) continue;
    const matches = classes.filter((c) => (c.code && label.includes(squash(c.code))) || (c.name.length > 3 && label.includes(squash(c.name))));
    if (matches.length === 1) d.prepare("UPDATE course_links SET class_id = ? WHERE course_key = ?").run(matches[0].id, course.course_key);
  }
  applyCourseLinks();
}

export function applyCourseLinks() {
  db().exec(`
    UPDATE events SET class_id = (SELECT class_id FROM course_links WHERE course_links.course_key = events.course_key)
    WHERE source = 'canvas' AND class_locked = 0 AND course_key != '';
  `);
}

export function upcomingEvents(limit = 6): CalendarEvent[] {
  const start = new Date(Date.now() - 12 * 3600_000).toISOString();
  const end = new Date(Date.now() + 8 * 86400_000).toISOString();
  return listEvents(start, end)
    .filter((e) => !e.done)
    .slice(0, limit);
}
