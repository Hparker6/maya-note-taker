"use client";

// Saving notes (title, text, handwriting) from the browser. One store per tab, outside React, so saves
// keep going when a view unmounts, and a remounted view never starts from an older copy.
//
// Guarantees:
// - Every edit is kept until the server confirms it. Failed saves retry with backoff, and again when
//   the connection or the window comes back.
// - Unsaved edits are mirrored to localStorage, so closing the window or a crash doesn't lose them.
// - Saves say which version they were based on. If the note changed elsewhere in the meantime (another
//   window or device, an AI conversion), the server refuses; the edits then go into a copy of the note
//   (text) or are merged stroke by stroke (handwriting). Nothing is overwritten and nothing is dropped.

import { useSyncExternalStore } from "react";
import { api, ApiError, isRetryable } from "./client";
import { parseInk, serializeInk, type InkStroke } from "./ink";
import type { NoteRow } from "./types";

export type SyncStatus = "idle" | "pending" | "saving" | "saved" | "error";
export interface NoteSyncState {
  status: SyncStatus;
  /** Why the last save failed. */
  error: string | null;
  /** The failure won't fix itself by retrying (e.g. the note is too large). */
  blocked: boolean;
}

interface PendingText {
  title: string;
  content: string;
  /** The server version (`updated_at`) these edits were made on top of. */
  base: string;
}

interface PendingInk {
  ink: string;
  line_spacing: string;
  /** The server version (`ink_updated_at`) these edits were made on top of. */
  base: string;
  /** The handwriting and spacing at that version, for merging with changes made elsewhere. */
  from: string;
  fromSpacing: string;
}

interface Entry {
  /** The note as the server last confirmed it. */
  server: NoteRow;
  text?: PendingText;
  ink?: PendingInk;
  error: string | null;
  blocked: boolean;
  saved: boolean;
}

export type NoteSyncEvent =
  /** The version on screen should be replaced by this one (a newer server version, or merged handwriting). */
  | { type: "replaced"; note: NoteRow }
  /** Edits that couldn't go into note `from` were saved as this new note. */
  | { type: "copied"; note: NoteRow; from: number; reason: "conflict" | "deleted" };

const SAVE_DELAY = 800;
const MAX_WAIT = 5_000;
const DRAFT_PREFIX = "maya:unsaved-note:";
const DRAFT_MAX_AGE = 60 * 24 * 60 * 60 * 1000;
const DRAFT_THROTTLE = 1_000;
const MAX_DRAFT_INK = 1_500_000;
const IDLE: NoteSyncState = { status: "idle", error: null, blocked: false };

const entries = new Map<number, Entry>();
const snapshots = new Map<number, NoteSyncState>();
const listeners = new Set<() => void>();
const eventListeners = new Set<(event: NoteSyncEvent) => void>();
const dirtyDrafts = new Set<number>();

let initialized = false;
let saving: number | null = null;
let inFlight: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let firstPendingAt = 0;
let attempt = 0;

const view = (entry: Entry): NoteRow => ({
  ...entry.server,
  ...(entry.text ? { title: entry.text.title, content: entry.text.content } : {}),
  ...(entry.ink ? { ink: entry.ink.ink, line_spacing: entry.ink.line_spacing } : {}),
});

const hasPending = (entry: Entry) => Boolean(entry.text || entry.ink);

// ───────────────────────────── status ─────────────────────────────

function stateOf(id: number): NoteSyncState {
  const entry = entries.get(id);
  if (!entry) return IDLE;
  const status: SyncStatus = saving === id ? "saving" : entry.error ? "error" : hasPending(entry) ? "pending" : entry.saved ? "saved" : "idle";
  return { status, error: entry.error, blocked: entry.blocked };
}

let notifyQueued = false;

function changed(id: number) {
  const next = stateOf(id);
  const prev = snapshots.get(id);
  if (prev && prev.status === next.status && prev.error === next.error && prev.blocked === next.blocked) return;
  snapshots.set(id, next);
  // Batched and deferred: changes can happen while React is rendering (seedNotes).
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const listener of listeners) listener();
  });
}

function emit(event: NoteSyncEvent) {
  for (const listener of eventListeners) listener(event);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Save status of one note, for a "Saving… / Saved / Couldn't save" indicator. */
export function useNoteSyncState(id: number | null | undefined): NoteSyncState {
  return useSyncExternalStore(
    subscribe,
    () => (id == null ? IDLE : (snapshots.get(id) ?? IDLE)),
    () => IDLE,
  );
}

// ───────────────────────────── drafts ─────────────────────────────

interface Draft {
  v: 1;
  at: number;
  text?: PendingText;
  ink?: PendingInk;
}

function writeDraft(id: number) {
  const entry = entries.get(id);
  try {
    if (!entry || !hasPending(entry)) return localStorage.removeItem(DRAFT_PREFIX + id);
    // A page of handwriting is far too big for browser storage; it's still held in memory and retried.
    const ink = entry.ink && entry.ink.ink.length + entry.ink.from.length < MAX_DRAFT_INK ? entry.ink : undefined;
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ v: 1, at: Date.now(), text: entry.text, ink } satisfies Draft));
  } catch {
    // Storage full or unavailable (private browsing): the in-memory copy and retries still protect the edit.
  }
}

function writeDirtyDrafts() {
  clearTimeout(draftTimer);
  draftTimer = undefined;
  for (const id of dirtyDrafts) writeDraft(id);
  dirtyDrafts.clear();
}

function markDraft(id: number) {
  dirtyDrafts.add(id);
  draftTimer ??= setTimeout(writeDirtyDrafts, DRAFT_THROTTLE);
}

function readDraft(id: number): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + id);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft?.v === 1 ? draft : null;
  } catch {
    return null;
  }
}

function pruneOldDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const draft = readDraft(Number(key.slice(DRAFT_PREFIX.length)));
      if (!draft || Date.now() - draft.at > DRAFT_MAX_AGE) localStorage.removeItem(key);
    }
  } catch {}
}

/** Brings back edits left unsaved by a closed window or a crash. */
function recoverDraft(id: number, entry: Entry) {
  const draft = readDraft(id);
  if (!draft) return;
  if (draft.text && (draft.text.title !== entry.server.title || draft.text.content !== entry.server.content)) entry.text = draft.text;
  if (draft.ink && (draft.ink.ink !== entry.server.ink || draft.ink.line_spacing !== entry.server.line_spacing)) entry.ink = draft.ink;
  if (hasPending(entry)) queueSave(0);
  else writeDraft(id);
}

// ───────────────────────────── merging ─────────────────────────────

const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const strokeKey = (s: InkStroke) => [s.t, s.c, s.s, s.r ?? 0, s.a ?? "", s.ay ?? "", s.p.map((pt) => pt.join(",")).join(";")].join("|");

/** Three-way merge of handwriting: strokes added here are added, strokes erased here are erased, everything else follows the server. */
export function mergeInk(from: string, local: string, remote: string): string {
  const base = new Set(parseInk(from).map(strokeKey));
  const mine = parseInk(local);
  const mineKeys = new Set(mine.map(strokeKey));
  const erased = new Set([...base].filter((key) => !mineKeys.has(key)));
  const theirs = parseInk(remote).filter((s) => !erased.has(strokeKey(s)));
  const theirKeys = new Set(theirs.map(strokeKey));
  const added = mine.filter((s) => !base.has(strokeKey(s)) && !theirKeys.has(strokeKey(s)));
  return serializeInk([...theirs, ...added]);
}

/** Takes in notes from the server: newer versions replace older ones, older copies (e.g. a cached page) are ignored. */
function absorb(entry: Entry, note: NoteRow) {
  const server = { ...entry.server, unit_id: note.unit_id, document_id: note.document_id, kind: note.kind };
  if (note.updated_at > server.updated_at) Object.assign(server, { title: note.title, content: note.content, updated_at: note.updated_at });
  if (note.ink_updated_at > server.ink_updated_at) Object.assign(server, { ink: note.ink, line_spacing: note.line_spacing, ink_updated_at: note.ink_updated_at });
  entry.server = server;
}

// ───────────────────────────── saving ─────────────────────────────

function queueSave(delay = SAVE_DELAY) {
  firstPendingAt ||= Date.now();
  clearTimeout(saveTimer);
  // Debounced, but never held back more than MAX_WAIT while someone keeps typing or writing.
  saveTimer = setTimeout(() => void flushNotes(), Math.max(0, Math.min(delay, firstPendingAt + MAX_WAIT - Date.now())));
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = Math.min(30_000, 1_500 * 2 ** attempt);
  attempt++;
  retryTimer = setTimeout(() => void flushNotes(), delay);
}

const copyTitle = (title: string, suffix: string) => `${(title.trim() || "Untitled note").slice(0, 180)} (${suffix})`;

async function createCopy(entry: Entry, title: string, content: string, reason: "conflict" | "deleted") {
  const copy = await api<NoteRow>("/api/notes", {
    json: { unit_id: entry.server.unit_id, title: copyTitle(title, reason === "conflict" ? "conflicting copy" : "recovered"), content },
  });
  seedNotes([copy]);
  return copy;
}

async function sendText(id: number, entry: Entry) {
  const sent = entry.text!;
  try {
    const res = await api<{ updated_at: string }>(`/api/notes/${id}`, {
      method: "PATCH",
      json: { title: sent.title, content: sent.content, base_updated_at: sent.base },
    });
    entry.server = { ...entry.server, title: sent.title, content: sent.content, updated_at: res.updated_at };
    if (entry.text === sent) entry.text = undefined;
    else if (entry.text) entry.text.base = res.updated_at;
  } catch (err) {
    if (entries.get(id) !== entry) return; // deleted on purpose meanwhile
    if (!(err instanceof ApiError) || (err.status !== 409 && err.status !== 404)) throw err;
    const local = entry.text ?? sent;
    if (err.status === 404) {
      const copy = await createCopy(entry, local.title, local.content, "deleted");
      if (entry.ink) editNoteInk(copy.id, { ink: entry.ink.ink, line_spacing: entry.ink.line_spacing });
      entries.delete(id);
      writeDraft(id);
      emit({ type: "copied", note: view(entries.get(copy.id)!), from: id, reason: "deleted" });
      return;
    }
    if (err.data.conflict !== "text" || !err.data.note) throw err;
    const remote = err.data.note as NoteRow;
    const same = textOf(local.content) === textOf(remote.content) && local.title.trim() === remote.title.trim();
    const copy = same ? null : await createCopy(entry, local.title, local.content, "conflict");
    absorb(entry, remote);
    entry.text = undefined;
    emit({ type: "replaced", note: view(entry) });
    if (copy) emit({ type: "copied", note: view(entries.get(copy.id)!), from: id, reason: "conflict" });
  }
}

async function sendInk(id: number, entry: Entry) {
  const sent = entry.ink!;
  try {
    const res = await api<{ ink_updated_at: string }>(`/api/notes/${id}`, {
      method: "PATCH",
      json: { ink: sent.ink, line_spacing: sent.line_spacing, base_ink_updated_at: sent.base },
    });
    entry.server = { ...entry.server, ink: sent.ink, line_spacing: sent.line_spacing, ink_updated_at: res.ink_updated_at };
    if (entry.ink === sent) entry.ink = undefined;
    else if (entry.ink) Object.assign(entry.ink, { base: res.ink_updated_at, from: sent.ink, fromSpacing: sent.line_spacing });
  } catch (err) {
    if (entries.get(id) !== entry) return; // deleted on purpose meanwhile
    const local = entry.ink ?? sent;
    if (err instanceof ApiError && err.status === 404) {
      const copy = await createCopy(entry, entry.server.title, entry.server.content, "deleted");
      editNoteInk(copy.id, { ink: local.ink, line_spacing: local.line_spacing });
      entries.delete(id);
      writeDraft(id);
      emit({ type: "copied", note: view(entries.get(copy.id)!), from: id, reason: "deleted" });
      return;
    }
    if (!(err instanceof ApiError) || err.status !== 409 || err.data.conflict !== "ink" || !err.data.note) throw err;
    const remote = err.data.note as NoteRow;
    absorb(entry, remote);
    entry.ink = {
      ink: mergeInk(local.from, local.ink, remote.ink),
      line_spacing: local.line_spacing !== local.fromSpacing ? local.line_spacing : remote.line_spacing,
      base: remote.ink_updated_at,
      from: remote.ink,
      fromSpacing: remote.line_spacing,
    };
    emit({ type: "replaced", note: view(entry) });
    // Saved by the next pass, on top of the version just received.
  }
}

async function runSaves(includeBlocked: boolean) {
  let failed = false;
  let retryable = false;
  for (const [id, entry] of [...entries]) {
    if (!hasPending(entry) || (entry.blocked && !includeBlocked)) continue;
    saving = id;
    changed(id);
    try {
      if (entry.text) await sendText(id, entry);
      if (entry.ink && entries.get(id) === entry) await sendInk(id, entry);
      entry.error = null;
      entry.blocked = false;
      entry.saved = true;
    } catch (err) {
      failed = true;
      entry.blocked = !isRetryable(err);
      retryable ||= !entry.blocked;
      entry.error = err instanceof ApiError ? err.message : "Can't reach the notebook right now";
    } finally {
      saving = null;
      writeDraft(id);
      changed(id);
    }
  }
  if (failed) {
    if (retryable) scheduleRetry();
  } else {
    attempt = 0;
    // Edits made while saving (or merged handwriting) go out on the normal schedule.
    if ([...entries.values()].some(hasPending)) queueSave();
  }
}

/**
 * Sends every unsaved edit now. `includeBlocked` also retries saves that failed for a reason
 * retrying won't fix on its own (used by the "retry" button).
 */
export async function flushNotes(includeBlocked = false): Promise<void> {
  clearTimeout(saveTimer);
  firstPendingAt = 0;
  while (inFlight) await inFlight;
  if (![...entries.values()].some((e) => hasPending(e) && (includeBlocked || !e.blocked))) return;
  clearTimeout(retryTimer);
  inFlight = runSaves(includeBlocked).finally(() => {
    inFlight = null;
  });
  await inFlight;
}

// ───────────────────────────── public API ─────────────────────────────

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  pruneOldDrafts();
  const kick = () => void flushNotes();
  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeDirtyDrafts();
    kick();
  });
  window.addEventListener("pagehide", () => {
    writeDirtyDrafts();
    kick();
  });
  window.addEventListener("beforeunload", (e) => {
    writeDirtyDrafts();
    if ([...entries.values()].some(hasPending) || inFlight) {
      kick();
      e.preventDefault();
    }
  });
}

/**
 * Registers notes from the server and returns what should be on screen: the newest version the
 * tab knows of, plus any unsaved edits (including ones recovered from a closed window).
 */
export function seedNotes(notes: NoteRow[]): NoteRow[] {
  if (typeof window === "undefined") return notes;
  init();
  return notes.map((note) => {
    let entry = entries.get(note.id);
    if (entry) absorb(entry, note);
    else {
      entry = { server: { ...note, ink: note.ink ?? "", line_spacing: note.line_spacing ?? "", ink_updated_at: note.ink_updated_at ?? "" }, error: null, blocked: false, saved: false };
      entries.set(note.id, entry);
      recoverDraft(note.id, entry);
      changed(note.id);
    }
    return view(entry);
  });
}

export function editNoteText(id: number, patch: Partial<Pick<NoteRow, "title" | "content">>) {
  const entry = entries.get(id);
  if (!entry) return;
  const current = entry.text ?? { title: entry.server.title, content: entry.server.content, base: entry.server.updated_at };
  entry.text = { ...current, ...patch };
  entry.blocked = false;
  changed(id);
  markDraft(id);
  queueSave();
}

export function editNoteInk(id: number, patch: Partial<Pick<NoteRow, "ink" | "line_spacing">>) {
  const entry = entries.get(id);
  if (!entry) return;
  const { server } = entry;
  const current = entry.ink ?? { ink: server.ink, line_spacing: server.line_spacing, base: server.ink_updated_at, from: server.ink, fromSpacing: server.line_spacing };
  entry.ink = { ...current, ...patch };
  entry.blocked = false;
  changed(id);
  markDraft(id);
  queueSave();
}

/** Saves one note's edits now; resolves true once nothing is left unsaved for it. */
export async function flushNote(id: number): Promise<boolean> {
  await flushNotes();
  const entry = entries.get(id);
  return !entry || !hasPending(entry);
}

export function hasUnsavedNote(id: number) {
  const entry = entries.get(id);
  return Boolean(entry && hasPending(entry));
}

/** The note was deleted on purpose: stop saving it. */
export function forgetNote(id: number) {
  entries.delete(id);
  snapshots.delete(id);
  writeDraft(id);
}

export function onNoteSyncEvent(listener: (event: NoteSyncEvent) => void) {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}
