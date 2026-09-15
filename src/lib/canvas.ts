import "server-only";
import ICAL from "ical.js";
import {
  autoLinkCourses,
  countSyncedEvents,
  listCourseLinks,
  pruneSyncedEvents,
  rememberCourse,
  removeAllSyncedEvents,
  upsertSyncedEvent,
  type SyncedEvent,
} from "./calendar";
import { getSetting, now, setSetting } from "./db";
import { sanitizeRichHtml } from "./html";
import type { CanvasStatus, EventKind } from "./types";

const FEED_URL = "canvas.feed_url";
const API_URL = "canvas.api_url";
const API_TOKEN = "canvas.token";
const LAST_SYNC = "canvas.last_sync";
const AUTO_SYNC_AFTER_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_FEED_BYTES = 15 * 1024 * 1024;

export class CanvasError extends Error {}

declare global {
  var __mayaCanvasSync: Promise<unknown> | null | undefined;
}

// ───────────────────────────── helpers ─────────────────────────────

export function classifyKind(title: string, hint: { quiz?: boolean; assignment?: boolean } = {}): EventKind {
  const t = title.toLowerCase();
  if (/(?<![\w-])(midterms?|exams?|tests?)\b|final exam|\bfinals\b/.test(t) && !/\bpractice\b/.test(t)) return "exam";
  if (hint.quiz || /\bquiz/.test(t)) return "quiz";
  if (/\b(lecture|class session|seminar|lab|office hours|tutorial)\b/.test(t)) return "lecture";
  if (/\b(study|review session)\b/.test(t)) return "study";
  return hint.assignment ? "assignment" : "other";
}

const plainToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeFeedUrl(raw: string) {
  const value = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CanvasError("That doesn't look like a link. Copy the full calendar feed URL from Canvas.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CanvasError("The calendar feed link must start with https://");
  return url.toString();
}

export function normalizeCanvasUrl(raw: string) {
  const value = raw.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname.includes(".")) throw new Error();
    return url.origin;
  } catch {
    throw new CanvasError("Enter your school's Canvas address, e.g. school.instructure.com");
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
  } catch {
    throw new CanvasError(`Couldn't reach ${new URL(url).hostname}. Check the link and your connection.`);
  }
}

function courseKeyFromUrl(url: string) {
  const match = /\/courses\/(\d+)/.exec(url) ?? /course_(\d+)/.exec(url);
  return match ? `canvas-course:${match[1]}` : "";
}

// ───────────────────────────── calendar feed (.ics) ─────────────────────────────

/** Parses an iCalendar feed (Canvas, Google, Outlook…) into events. */
export function parseIcs(text: string, reference = Date.now()): { events: SyncedEvent[]; courses: Map<string, string> } {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new CanvasError("The calendar feed couldn't be read. Make sure you copied the Calendar Feed link from Canvas.");
  }
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

  const windowStart = ICAL.Time.fromJSDate(new Date(reference - 180 * 86400_000), true);
  const windowEnd = ICAL.Time.fromJSDate(new Date(reference + 400 * 86400_000), true);
  const events: SyncedEvent[] = [];
  const courses = new Map<string, string>();

  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    const summary = (event.summary ?? "").trim();
    if (!summary || !event.startDate) continue;

    const bracket = /\s*\[([^\]]+)\]\s*$/.exec(summary);
    const title = bracket ? summary.slice(0, bracket.index).trim() || summary : summary;
    const courseLabel = bracket?.[1]?.trim() ?? "";
    const url = String(vevent.getFirstPropertyValue("url") ?? "");
    const uid = event.uid || `${summary}-${event.startDate.toString()}`;
    const assignmentId = /event-assignment-(\d+)/.exec(uid)?.[1];
    const calendarEventId = /event-calendar-event-(\d+)/.exec(uid)?.[1];
    const courseKey = courseKeyFromUrl(url) || (courseLabel ? `label:${courseLabel.toLowerCase()}` : "");
    if (courseKey) courses.set(courseKey, courseLabel);

    const htmlDescription = String(vevent.getFirstPropertyValue("x-alt-desc") ?? "");
    const description = sanitizeRichHtml(htmlDescription || plainToHtml(event.description ?? ""));
    const base = {
      title,
      kind: classifyKind(title, { assignment: Boolean(assignmentId) }),
      location: event.location ?? "",
      description,
      url,
      points: null,
      weight: null,
      group_name: "",
      group_weight: null,
      course_key: courseKey,
      course_label: courseLabel,
      submission_status: "",
      score: null,
    };

    const occurrences: { start: ICAL.Time; end: ICAL.Time | null; suffix: string }[] = [];
    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let next = iterator.next(), guard = 0; next && guard < 800; next = iterator.next(), guard++) {
        if (next.compare(windowEnd) > 0) break;
        if (next.compare(windowStart) < 0) continue;
        const details = event.getOccurrenceDetails(next);
        occurrences.push({ start: details.startDate, end: details.endDate, suffix: `:${next.toString()}` });
      }
    } else {
      occurrences.push({ start: event.startDate, end: event.endDate ?? null, suffix: "" });
    }

    for (const { start, end, suffix } of occurrences) {
      const allDay = start.isDate;
      let startsAt: string;
      let endsAt: string | null = null;
      if (allDay) {
        startsAt = start.toString().slice(0, 10);
        if (end) {
          // DTEND is exclusive for all-day events.
          const last = end.clone();
          last.adjust(-1, 0, 0, 0);
          if (last.compare(start) > 0) endsAt = last.toString().slice(0, 10);
        }
      } else {
        startsAt = start.toJSDate().toISOString();
        const endIso = end?.toJSDate().toISOString();
        endsAt = endIso && endIso !== startsAt ? endIso : null;
      }
      const externalKey = assignmentId
        ? `canvas:assignment:${assignmentId}`
        : calendarEventId
          ? `canvas:event:${calendarEventId}${suffix}`
          : `ics:${uid}${suffix}`;
      events.push({ ...base, external_key: externalKey, starts_at: startsAt, ends_at: endsAt, all_day: allDay });
    }
  }
  return { events, courses };
}

// ───────────────────────────── Canvas REST API ─────────────────────────────

interface ApiCourse {
  id: number;
  name: string;
  course_code: string;
  apply_assignment_group_weights?: boolean;
}

interface ApiSubmission {
  workflow_state?: string;
  submitted_at?: string | null;
  score?: number | null;
  missing?: boolean;
  late?: boolean;
  excused?: boolean;
}

interface ApiAssignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types?: string[];
  is_quiz_assignment?: boolean;
  omit_from_final_grade?: boolean;
  submission?: ApiSubmission;
}

interface ApiAssignmentGroup {
  id: number;
  name: string;
  group_weight: number | null;
  assignments?: ApiAssignment[];
}

interface ApiCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day?: boolean;
  location_name?: string | null;
  html_url?: string;
  context_code?: string;
}

async function canvasGetAll<T>(base: string, token: string, path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${base}${path}`;
  for (let page = 0; url && page < 50; page++) {
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 401) throw new CanvasError("Canvas rejected the access token. Create a new one in Canvas → Account → Settings.");
    if (res.status === 403) throw new CanvasError("Canvas denied access. Your school may have disabled access tokens — use the calendar feed link instead.");
    if (!res.ok) throw new CanvasError(`Canvas returned an error (${res.status}).`);
    const data = (await res.json()) as T[];
    results.push(...data);
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "");
    url = next ? next[1] : null;
  }
  return results;
}

function submissionStatus(sub?: ApiSubmission) {
  if (!sub) return "";
  if (sub.excused) return "excused";
  if (sub.missing) return "missing";
  if (sub.workflow_state === "graded") return "graded";
  if (sub.submitted_at || sub.workflow_state === "submitted" || sub.workflow_state === "pending_review") return sub.late ? "late" : "submitted";
  return "";
}

async function fetchFromApi(base: string, token: string, reference = Date.now()) {
  const courses = await canvasGetAll<ApiCourse>(base, token, "/api/v1/courses?enrollment_state=active&per_page=100");
  const events: SyncedEvent[] = [];
  const labels = new Map<string, string>();

  for (const course of courses) {
    const courseKey = `canvas-course:${course.id}`;
    const label = [course.course_code, course.name].filter((s, i, a) => s && a.indexOf(s) === i).join(" ");
    labels.set(courseKey, label);

    const groups = await canvasGetAll<ApiAssignmentGroup>(
      base,
      token,
      `/api/v1/courses/${course.id}/assignment_groups?include[]=assignments&include[]=submission&per_page=100`,
    );
    const counts = (a: ApiAssignment) => !a.omit_from_final_grade && (a.points_possible ?? 0) > 0;
    const courseTotal = groups.flatMap((g) => g.assignments ?? []).filter(counts).reduce((s, a) => s + (a.points_possible ?? 0), 0);

    for (const group of groups) {
      const groupTotal = (group.assignments ?? []).filter(counts).reduce((s, a) => s + (a.points_possible ?? 0), 0);
      for (const a of group.assignments ?? []) {
        if (!a.due_at) continue;
        const points = a.points_possible ?? null;
        let weight: number | null = null;
        if (points && counts(a)) {
          if (course.apply_assignment_group_weights) {
            if (group.group_weight && groupTotal > 0) weight = round2((group.group_weight * points) / groupTotal);
          } else if (courseTotal > 0) {
            weight = round2((100 * points) / courseTotal);
          }
        }
        const quiz = Boolean(a.is_quiz_assignment) || Boolean(a.submission_types?.includes("online_quiz"));
        events.push({
          external_key: `canvas:assignment:${a.id}`,
          title: a.name,
          kind: classifyKind(a.name, { quiz, assignment: true }),
          starts_at: new Date(a.due_at).toISOString(),
          ends_at: null,
          all_day: false,
          location: "",
          description: sanitizeRichHtml(a.description ?? ""),
          url: a.html_url,
          points,
          weight,
          group_name: group.name,
          group_weight: course.apply_assignment_group_weights ? (group.group_weight ?? null) : null,
          course_key: courseKey,
          course_label: label,
          submission_status: submissionStatus(a.submission),
          score: a.submission?.score ?? null,
        });
      }
    }
  }

  // Scheduled class events (lectures, exam sessions) — max 10 contexts per request.
  const start = new Date(reference - 120 * 86400_000).toISOString();
  const end = new Date(reference + 365 * 86400_000).toISOString();
  for (let i = 0; i < courses.length; i += 10) {
    const contexts = courses
      .slice(i, i + 10)
      .map((c) => `context_codes[]=course_${c.id}`)
      .join("&");
    const calendarEvents = await canvasGetAll<ApiCalendarEvent>(
      base,
      token,
      `/api/v1/calendar_events?type=event&start_date=${start}&end_date=${end}&${contexts}&per_page=100`,
    );
    for (const ce of calendarEvents) {
      if (!ce.start_at) continue;
      const courseKey = /course_(\d+)/.test(ce.context_code ?? "") ? `canvas-course:${/course_(\d+)/.exec(ce.context_code!)![1]}` : "";
      const allDay = Boolean(ce.all_day);
      events.push({
        external_key: `canvas:event:${ce.id}`,
        title: ce.title,
        kind: classifyKind(ce.title),
        starts_at: allDay ? ce.start_at.slice(0, 10) : new Date(ce.start_at).toISOString(),
        ends_at: allDay || !ce.end_at || ce.end_at === ce.start_at ? null : new Date(ce.end_at).toISOString(),
        all_day: allDay,
        location: ce.location_name ?? "",
        description: sanitizeRichHtml(ce.description ?? ""),
        url: ce.html_url ?? "",
        points: null,
        weight: null,
        group_name: "",
        group_weight: null,
        course_key: courseKey,
        course_label: labels.get(courseKey) ?? "",
        submission_status: "",
        score: null,
      });
    }
  }
  return { events, courses: labels };
}

// ───────────────────────────── sync ─────────────────────────────

interface LastSync {
  at: string;
  ok: boolean;
  message: string;
  events: number;
}

function readLastSync(): LastSync | null {
  try {
    return JSON.parse(getSetting(LAST_SYNC) ?? "null");
  } catch {
    return null;
  }
}

export function canvasConfigured() {
  return Boolean(getSetting(FEED_URL) || (getSetting(API_URL) && getSetting(API_TOKEN)));
}

async function runSync(): Promise<LastSync> {
  const startedAt = now();
  const feedUrl = getSetting(FEED_URL);
  const apiUrl = getSetting(API_URL);
  const token = getSetting(API_TOKEN);
  const problems: string[] = [];
  let seen = 0;
  let sourcesOk = 0;
  let sources = 0;

  if (feedUrl) {
    sources++;
    try {
      const res = await fetchWithTimeout(feedUrl, { headers: { Accept: "text/calendar, */*" } });
      if (!res.ok) throw new CanvasError(`The calendar feed returned an error (${res.status}). Copy a fresh link from Canvas.`);
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_FEED_BYTES) throw new CanvasError("The calendar feed is unexpectedly large.");
      const { events, courses } = parseIcs(await res.text());
      for (const [key, label] of courses) rememberCourse(key, label);
      for (const e of events) upsertSyncedEvent(e, startedAt, false);
      seen += events.length;
      sourcesOk++;
    } catch (err) {
      problems.push(err instanceof CanvasError ? err.message : "The calendar feed couldn't be synced.");
      if (!(err instanceof CanvasError)) console.error("[canvas feed]", err);
    }
  }

  if (apiUrl && token) {
    sources++;
    try {
      const { events, courses } = await fetchFromApi(apiUrl, token);
      for (const [key, label] of courses) rememberCourse(key, label);
      for (const e of events) upsertSyncedEvent(e, startedAt, true);
      seen += events.length;
      sourcesOk++;
    } catch (err) {
      problems.push(err instanceof CanvasError ? err.message : "Canvas couldn't be synced.");
      if (!(err instanceof CanvasError)) console.error("[canvas api]", err);
    }
  }

  // Only remove events that vanished upstream when every source answered.
  if (sources && sourcesOk === sources) pruneSyncedEvents(startedAt);
  autoLinkCourses();

  const result: LastSync = {
    at: now(),
    ok: problems.length === 0,
    message: problems.join(" ") || `Synced ${seen} item${seen === 1 ? "" : "s"} from Canvas.`,
    events: countSyncedEvents(),
  };
  setSetting(LAST_SYNC, JSON.stringify(result));
  return result;
}

/** Runs a sync, or joins the one already in progress. */
export function syncCanvas(): Promise<LastSync> {
  if (!globalThis.__mayaCanvasSync) {
    globalThis.__mayaCanvasSync = runSync().finally(() => {
      globalThis.__mayaCanvasSync = null;
    });
  }
  return globalThis.__mayaCanvasSync as Promise<LastSync>;
}

/** Keeps Canvas data fresh: starts a background sync when the last one is over an hour old. */
export function maybeAutoSync() {
  if (!canvasConfigured() || globalThis.__mayaCanvasSync) return;
  const last = readLastSync();
  if (last && Date.now() - new Date(last.at).getTime() < AUTO_SYNC_AFTER_MS) return;
  void syncCanvas().catch((err) => console.error("[canvas auto-sync]", err));
}

export function saveCanvasSettings(input: { feedUrl?: string | null; apiUrl?: string | null; token?: string | null }) {
  if (input.feedUrl !== undefined) setSetting(FEED_URL, input.feedUrl ? normalizeFeedUrl(input.feedUrl) : null);
  if (input.apiUrl !== undefined) setSetting(API_URL, input.apiUrl ? normalizeCanvasUrl(input.apiUrl) : null);
  if (input.token !== undefined) setSetting(API_TOKEN, input.token ? input.token.trim() : null);
}

export function disconnectCanvas() {
  for (const key of [FEED_URL, API_URL, API_TOKEN, LAST_SYNC]) setSetting(key, null);
  removeAllSyncedEvents();
}

export function canvasStatus(): CanvasStatus {
  const feed = getSetting(FEED_URL);
  const token = getSetting(API_TOKEN);
  return {
    // The feed link and token are secrets; only show enough to recognize them.
    feedUrl: feed ? `${new URL(feed).host}/…${feed.slice(-6)}` : null,
    apiBaseUrl: getSetting(API_URL),
    tokenHint: token ? `••••${token.slice(-4)}` : null,
    lastSync: readLastSync(),
    syncing: Boolean(globalThis.__mayaCanvasSync),
    courses: listCourseLinks(),
  };
}
