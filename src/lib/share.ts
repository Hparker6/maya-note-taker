import "server-only";
import crypto from "node:crypto";
import os from "node:os";
import { strokeOpacity, strokeToPath } from "@/components/editor/drawing/strokes";
import { dedupeKey } from "./card-extract";
import { db, now } from "./db";
import { htmlToText, sanitizeRichHtml } from "./html";
import { parseInk, sanitizeInk } from "./ink";
import { addQuestions, createCard, listCards, listQuestions } from "./practice";
import { createClass, getClass, getNote, getSheet, getUnitContext, listNotes } from "./repo";
import { isClassColor } from "./colors";
import type { ClassRow, NoteRow, SectionRow, UnitRow } from "./types";

export type ShareScope = "class" | "unit" | "note";

export interface ShareInclude {
  /** Her own notes. */
  notes: boolean;
  /** Notes made from lecture PDFs. */
  lectures: boolean;
  sheets: boolean;
  /** Flashcards and quiz questions. */
  practice: boolean;
}

export const DEFAULT_INCLUDE: ShareInclude = { notes: true, lectures: true, sheets: true, practice: true };

/** Handwriting pre-rendered to SVG paths, positioned in the viewer by anchor block. */
export interface SharedInkStroke {
  d: string;
  c: string;
  o: number;
  a?: string;
  ay?: number;
}

export interface SharedNote {
  title: string;
  kind: "note" | "lecture";
  html: string;
  /** Raw ink JSON (kept so imports restore it). */
  ink: string;
  paths: SharedInkStroke[];
  line_spacing: string;
}

export interface SharedUnit {
  name: string;
  sheet: string | null;
  notes: SharedNote[];
  cards: { kind: string; front: string; back: string }[];
  questions: { prompt: string; choices: string[]; answer: number; explanation: string }[];
}

export interface SharedSection {
  name: string;
  sheet: string | null;
  units: SharedUnit[];
}

export interface ShareBundle {
  format: "maya-notebook-share";
  version: 1;
  exported_at: string;
  scope: ShareScope;
  title: string;
  class: { name: string; code: string; color: string; sections: SharedSection[] };
}

const inkPaths = (ink: string): SharedInkStroke[] =>
  parseInk(ink).map((s) => ({ d: strokeToPath(s), c: s.c, o: strokeOpacity(s), ...(s.a ? { a: s.a, ay: s.ay } : {}) }));

function sharedNote(note: NoteRow): SharedNote {
  return {
    title: note.title || "Untitled note",
    kind: note.kind === "import" ? "lecture" : "note",
    html: note.content,
    ink: note.ink ?? "",
    paths: inkPaths(note.ink ?? ""),
    line_spacing: note.line_spacing ?? "",
  };
}

function sharedUnit(unit: UnitRow, include: ShareInclude): SharedUnit {
  const notes = listNotes(unit.id)
    .filter((n) => (n.kind === "import" ? include.lectures : include.notes))
    .sort((a, b) => (a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === "import" ? -1 : 1));
  return {
    name: unit.name,
    sheet: include.sheets ? (getSheet("unit", unit.id)?.content ?? null) : null,
    notes: notes.map(sharedNote),
    cards: include.practice ? listCards(unit.id).map((c) => ({ kind: c.kind, front: c.front, back: c.back })) : [],
    questions: include.practice
      ? listQuestions(unit.id).map((q) => ({ prompt: q.prompt, choices: q.choices, answer: q.answer, explanation: q.explanation }))
      : [],
  };
}

function bundle(scope: ShareScope, title: string, klass: ClassRow, sections: SharedSection[]): ShareBundle {
  return {
    format: "maya-notebook-share",
    version: 1,
    exported_at: now(),
    scope,
    title,
    class: { name: klass.name, code: klass.code, color: klass.color, sections },
  };
}

/** Everything a share contains, ready to render or download. Undefined when the item no longer exists. */
export function buildBundle(scope: ShareScope, id: number, include: ShareInclude): ShareBundle | undefined {
  const d = db();
  if (scope === "class") {
    const klass = getClass(id);
    if (!klass) return undefined;
    const sections = d.prepare("SELECT * FROM sections WHERE class_id = ? ORDER BY position, id").all(id) as SectionRow[];
    return bundle(
      scope,
      klass.name,
      klass,
      sections.map((s) => ({
        name: s.name,
        sheet: include.sheets ? (getSheet("section", s.id)?.content ?? null) : null,
        units: (d.prepare("SELECT * FROM units WHERE section_id = ? ORDER BY position, id").all(s.id) as UnitRow[]).map((u) => sharedUnit(u, include)),
      })),
    );
  }
  if (scope === "unit") {
    const ctx = getUnitContext(id);
    if (!ctx) return undefined;
    return bundle(scope, ctx.unit.name, ctx.klass, [{ name: ctx.section.name, sheet: null, units: [sharedUnit(ctx.unit, include)] }]);
  }
  const note = getNote(id);
  const ctx = note && getUnitContext(note.unit_id);
  if (!note || !ctx) return undefined;
  return bundle(scope, note.title || "Untitled note", ctx.klass, [
    { name: ctx.section.name, sheet: null, units: [{ name: ctx.unit.name, sheet: null, notes: [sharedNote(note)], cards: [], questions: [] }] },
  ]);
}

// ───────────────────────────── links ─────────────────────────────

export interface ShareLink {
  token: string;
  scope: ShareScope;
  scope_id: number;
  include: ShareInclude;
  views: number;
  created_at: string;
}

interface ShareRow extends Omit<ShareLink, "include"> {
  include: string;
}

const parseRow = (row: ShareRow): ShareLink => ({ ...row, include: { ...DEFAULT_INCLUDE, ...JSON.parse(row.include || "{}") } });

export function createShareLink(scope: ShareScope, scopeId: number, include: ShareInclude): ShareLink {
  const token = crypto.randomBytes(18).toString("base64url");
  db().prepare("INSERT INTO shares (token, scope, scope_id, include, created_at) VALUES (?, ?, ?, ?, ?)").run(token, scope, scopeId, JSON.stringify(include), now());
  return getShareLink(token)!;
}

export function getShareLink(token: string): ShareLink | undefined {
  if (!/^[\w-]{10,64}$/.test(token)) return undefined;
  const row = db().prepare("SELECT * FROM shares WHERE token = ?").get(token) as ShareRow | undefined;
  return row ? parseRow(row) : undefined;
}

export function listShareLinks(scope: ShareScope, scopeId: number): ShareLink[] {
  return (db().prepare("SELECT * FROM shares WHERE scope = ? AND scope_id = ? ORDER BY created_at DESC").all(scope, scopeId) as ShareRow[]).map(parseRow);
}

export function deleteShareLink(token: string) {
  return db().prepare("DELETE FROM shares WHERE token = ?").run(token).changes > 0;
}

export function countShareView(token: string) {
  db().prepare("UPDATE shares SET views = views + 1 WHERE token = ?").run(token);
}

/** The address classmates on the same Wi-Fi can use (localhost only works on this computer). */
export function lanOrigin(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) return null;
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        return `${url.protocol}//${a.address}${url.port ? `:${url.port}` : ""}`;
      }
    }
  }
  return null;
}

// ───────────────────────────── import ─────────────────────────────

export class ShareImportError extends Error {}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Pulls the bundle out of a downloaded share file (or accepts the JSON itself). */
export function parseShareFile(text: string): ShareBundle {
  const match = /<script type="application\/json" id="maya-notebook-share">([\s\S]*?)<\/script>/.exec(text);
  let data: unknown;
  try {
    data = JSON.parse(match ? match[1] : text);
  } catch {
    throw new ShareImportError("That file isn't a shared notebook.");
  }
  const b = data as Partial<ShareBundle>;
  if (b?.format !== "maya-notebook-share" || b.version !== 1 || !b.class || !Array.isArray(b.class.sections)) {
    throw new ShareImportError("That file isn't a shared notebook.");
  }
  return b as ShareBundle;
}

/** Adds a shared notebook as a new class. Everything is re-validated and sanitized. */
export function importBundle(bundle: ShareBundle): { classId: number; notes: number } {
  const d = db();
  const klass = bundle.class;
  let notes = 0;
  let classId = 0;
  d.transaction(() => {
    classId = createClass({
      name: str(klass.name, 200).trim() || "Shared notes",
      code: str(klass.code, 40),
      color: isClassColor(klass.color) ? klass.color : "sage",
    });
    const at = now();
    for (const [si, section] of (Array.isArray(klass.sections) ? klass.sections : []).slice(0, 200).entries()) {
      const sectionId = Number(
        d.prepare("INSERT INTO sections (class_id, name, position, created_at) VALUES (?, ?, ?, ?)").run(classId, str(section?.name, 200).trim() || "Section", si, at).lastInsertRowid,
      );
      if (section?.sheet) d.prepare("INSERT INTO sheets (scope, scope_id, content, generated_at, updated_at) VALUES ('section', ?, ?, ?, ?)").run(sectionId, sanitizeRichHtml(str(section.sheet, 4_000_000)), at, at);
      for (const [ui, unit] of (Array.isArray(section?.units) ? section.units : []).slice(0, 500).entries()) {
        const unitId = Number(
          d.prepare("INSERT INTO units (section_id, name, position, created_at) VALUES (?, ?, ?, ?)").run(sectionId, str(unit?.name, 200).trim() || "Unit", ui, at).lastInsertRowid,
        );
        if (unit?.sheet) d.prepare("INSERT INTO sheets (scope, scope_id, content, generated_at, updated_at) VALUES ('unit', ?, ?, ?, ?)").run(unitId, sanitizeRichHtml(str(unit.sheet, 4_000_000)), at, at);
        for (const note of (Array.isArray(unit?.notes) ? unit.notes : []).slice(0, 2000)) {
          let ink = "";
          try {
            ink = sanitizeInk(note?.ink ?? "");
          } catch {}
          const title = str(note?.title, 200);
          const content = sanitizeRichHtml(str(note?.html, 8_000_000));
          const noteId = Number(
            d.prepare("INSERT INTO notes (unit_id, kind, title, content, ink, line_spacing, created_at, updated_at) VALUES (?, 'note', ?, ?, ?, ?, ?, ?)")
              .run(unitId, title, content, ink, note?.line_spacing === "roomy" ? "roomy" : "", at, at).lastInsertRowid,
          );
          d.prepare("INSERT INTO search_index (kind, ref, title, body) VALUES ('note', ?, ?, ?)").run(String(noteId), title, htmlToText(content));
          notes++;
        }
        const seen = new Set<string>();
        for (const card of (Array.isArray(unit?.cards) ? unit.cards : []).slice(0, 5000)) {
          const front = str(card?.front, 300).trim();
          const back = str(card?.back, 700).trim();
          if (!front || !back || seen.has(dedupeKey(front))) continue;
          seen.add(dedupeKey(front));
          createCard({ unitId, front, back, kind: card.kind === "cloze" || card.kind === "list" ? card.kind : "basic", source: "manual", origin: "Shared by a classmate" });
        }
        const questions = (Array.isArray(unit?.questions) ? unit.questions : []).slice(0, 2000).filter((q) => q && typeof q.prompt === "string" && Array.isArray(q.choices));
        if (questions.length)
          addQuestions(
            unitId,
            questions.map((q) => ({ prompt: q.prompt, choices: q.choices.map((c) => str(c, 300)), answer: Number(q.answer), explanation: str(q.explanation, 600) })),
          );
      }
    }
  })();
  return { classId, notes };
}
