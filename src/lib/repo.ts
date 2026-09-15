import "server-only";
import crypto from "node:crypto";
import { db, now } from "./db";
import { htmlToText } from "./html";
import { deleteStoredFile } from "./storage";
import type {
  ClassNode,
  ClassRow,
  DocumentRow,
  NoteKind,
  NoteRow,
  SearchHit,
  SectionRow,
  SheetRow,
  SheetScope,
  UnitContext,
  UnitNode,
  UnitRow,
} from "./types";

const DOC_COLUMNS = "id, unit_id, title, original_name, size, page_count, import_method, imported_at, created_at";

// ───────────────────────────── search index ─────────────────────────────

function indexItem(kind: string, ref: string, title: string, body: string) {
  const d = db();
  d.prepare("DELETE FROM search_index WHERE kind = ? AND ref = ?").run(kind, ref);
  d.prepare("INSERT INTO search_index (kind, ref, title, body) VALUES (?, ?, ?, ?)").run(
    kind,
    ref,
    title,
    body,
  );
}

function unindex(kind: string, ref: string) {
  db().prepare("DELETE FROM search_index WHERE kind = ? AND ref = ?").run(kind, ref);
}

/** Removes sheets, index rows and files left behind by cascading deletes. */
function cleanupOrphans(storedNames: string[]) {
  const d = db();
  d.exec(`
    DELETE FROM notes WHERE kind = 'import' AND document_id IS NULL;
    DELETE FROM sheets WHERE scope = 'document' AND scope_id NOT IN (SELECT id FROM documents);
    DELETE FROM sheets WHERE scope = 'unit' AND scope_id NOT IN (SELECT id FROM units);
    DELETE FROM sheets WHERE scope = 'section' AND scope_id NOT IN (SELECT id FROM sections);
    DELETE FROM search_index WHERE kind = 'document' AND CAST(ref AS INTEGER) NOT IN (SELECT id FROM documents);
    DELETE FROM search_index WHERE kind = 'note' AND CAST(ref AS INTEGER) NOT IN (SELECT id FROM notes);
    DELETE FROM search_index WHERE kind = 'sheet' AND ref NOT IN (SELECT scope || ':' || scope_id FROM sheets);
  `);
  for (const name of storedNames) deleteStoredFile(name);
}

function nextPosition(table: "classes" | "sections" | "units", where = "", arg?: number) {
  const row = db()
    .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM ${table} ${where}`)
    .get(...(arg === undefined ? [] : [arg])) as { p: number };
  return row.p;
}

function move(table: "classes" | "sections" | "units", parentCol: string | null, id: number, dir: "up" | "down") {
  const d = db();
  const row = d.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | (Record<string, number> & { position: number })
    | undefined;
  if (!row) return;
  const scope = parentCol ? `AND ${parentCol} = ${Number(row[parentCol])}` : "";
  const neighbor = d
    .prepare(
      dir === "up"
        ? `SELECT id, position FROM ${table} WHERE (position < ? OR (position = ? AND id < ?)) ${scope} ORDER BY position DESC, id DESC LIMIT 1`
        : `SELECT id, position FROM ${table} WHERE (position > ? OR (position = ? AND id > ?)) ${scope} ORDER BY position ASC, id ASC LIMIT 1`,
    )
    .get(row.position, row.position, id) as { id: number; position: number } | undefined;
  if (!neighbor) return;
  const swap = d.transaction(() => {
    const mine = neighbor.position === row.position ? row.position + (dir === "up" ? 1 : -1) : row.position;
    d.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).run(neighbor.position, id);
    d.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).run(mine, neighbor.id);
  });
  swap();
}

// ───────────────────────────── tree ─────────────────────────────

export function getTree(): ClassNode[] {
  const d = db();
  const classes = d.prepare("SELECT * FROM classes ORDER BY position, id").all() as ClassRow[];
  const sections = d.prepare("SELECT * FROM sections ORDER BY position, id").all() as SectionRow[];
  const units = d
    .prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM documents WHERE unit_id = u.id) AS doc_count,
        (SELECT COUNT(*) FROM notes WHERE unit_id = u.id AND kind = 'note') AS note_count,
        EXISTS (SELECT 1 FROM sheets WHERE scope = 'unit' AND scope_id = u.id) AS has_sheet
       FROM units u ORDER BY position, id`,
    )
    .all() as (Omit<UnitNode, "has_sheet"> & { has_sheet: number })[];

  return classes.map((c) => ({
    ...c,
    sections: sections
      .filter((s) => s.class_id === c.id)
      .map((s) => ({
        ...s,
        units: units
          .filter((u) => u.section_id === s.id)
          .map((u) => ({ ...u, has_sheet: Boolean(u.has_sheet) })),
      })),
  }));
}

export function getStats() {
  const d = db();
  const count = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    classes: count("SELECT COUNT(*) AS n FROM classes"),
    documents: count("SELECT COUNT(*) AS n FROM documents"),
    pages: count("SELECT COALESCE(SUM(page_count), 0) AS n FROM documents"),
    notes: count("SELECT COUNT(*) AS n FROM notes WHERE kind = 'note'"),
    sheets: count("SELECT COUNT(*) AS n FROM sheets"),
  };
}

export interface RecentItem {
  kind: "note" | "document" | "sheet";
  title: string;
  href: string;
  context: string;
  at: string;
}

export function getRecent(limit = 8): RecentItem[] {
  const d = db();
  const rows = d
    .prepare(
      `SELECT * FROM (
         SELECT CASE n.kind WHEN 'import' THEN 'document' ELSE 'note' END AS kind,
                n.id AS id, n.title AS title, n.updated_at AS at, n.unit_id AS unit_id FROM notes n
         UNION ALL
         SELECT 'sheet', s.scope_id, '', s.updated_at, s.scope_id FROM sheets s WHERE s.scope = 'unit'
       ) ORDER BY at DESC LIMIT ?`,
    )
    .all(limit) as { kind: RecentItem["kind"]; id: number; title: string; at: string; unit_id: number }[];

  return rows.flatMap((r): RecentItem[] => {
    const ctx = getUnitContext(r.unit_id);
    if (!ctx) return [];
    const context = `${ctx.klass.name} › ${ctx.section.name} › ${ctx.unit.name}`;
    if (r.kind === "note" || r.kind === "document")
      return [{ kind: r.kind, title: r.title || "Untitled note", href: `/units/${r.unit_id}?tab=notes&note=${r.id}`, context, at: r.at }];
    return [{ kind: r.kind, title: `${ctx.unit.name} study sheet`, href: `/units/${r.unit_id}?tab=sheet`, context, at: r.at }];
  });
}

// ───────────────────────────── classes ─────────────────────────────

export function getClass(id: number) {
  return db().prepare("SELECT * FROM classes WHERE id = ?").get(id) as ClassRow | undefined;
}

export function createClass(input: { name: string; code: string; color: string }) {
  const result = db()
    .prepare("INSERT INTO classes (name, code, color, position, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.name, input.code, input.color, nextPosition("classes"), now());
  return Number(result.lastInsertRowid);
}

export function updateClass(id: number, patch: Partial<Pick<ClassRow, "name" | "code" | "color">>) {
  const current = getClass(id);
  if (!current) return false;
  const next = { ...current, ...patch };
  db().prepare("UPDATE classes SET name = ?, code = ?, color = ? WHERE id = ?").run(next.name, next.code, next.color, id);
  return true;
}

export const moveClass = (id: number, dir: "up" | "down") => move("classes", null, id, dir);

export function deleteClass(id: number) {
  const files = db()
    .prepare(
      `SELECT d.stored_name FROM documents d JOIN units u ON u.id = d.unit_id
       JOIN sections s ON s.id = u.section_id WHERE s.class_id = ?`,
    )
    .pluck()
    .all(id) as string[];
  db().prepare("DELETE FROM classes WHERE id = ?").run(id);
  cleanupOrphans(files);
}

// ───────────────────────────── sections ─────────────────────────────

export function getSection(id: number) {
  return db().prepare("SELECT * FROM sections WHERE id = ?").get(id) as SectionRow | undefined;
}

export function createSection(classId: number, name: string) {
  const result = db()
    .prepare("INSERT INTO sections (class_id, name, position, created_at) VALUES (?, ?, ?, ?)")
    .run(classId, name, nextPosition("sections", "WHERE class_id = ?", classId), now());
  return Number(result.lastInsertRowid);
}

export function renameSection(id: number, name: string) {
  return db().prepare("UPDATE sections SET name = ? WHERE id = ?").run(name, id).changes > 0;
}

export const moveSection = (id: number, dir: "up" | "down") => move("sections", "class_id", id, dir);

export function deleteSection(id: number) {
  const files = db()
    .prepare("SELECT d.stored_name FROM documents d JOIN units u ON u.id = d.unit_id WHERE u.section_id = ?")
    .pluck()
    .all(id) as string[];
  db().prepare("DELETE FROM sections WHERE id = ?").run(id);
  cleanupOrphans(files);
}

// ───────────────────────────── units ─────────────────────────────

export function getUnitContext(unitId: number): UnitContext | undefined {
  const unit = db().prepare("SELECT * FROM units WHERE id = ?").get(unitId) as UnitRow | undefined;
  if (!unit) return undefined;
  const section = getSection(unit.section_id)!;
  const klass = getClass(section.class_id)!;
  return { unit, section, klass };
}

export function createUnit(sectionId: number, name: string) {
  const result = db()
    .prepare("INSERT INTO units (section_id, name, position, created_at) VALUES (?, ?, ?, ?)")
    .run(sectionId, name, nextPosition("units", "WHERE section_id = ?", sectionId), now());
  return Number(result.lastInsertRowid);
}

export function renameUnit(id: number, name: string) {
  return db().prepare("UPDATE units SET name = ? WHERE id = ?").run(name, id).changes > 0;
}

export const moveUnit = (id: number, dir: "up" | "down") => move("units", "section_id", id, dir);

export function deleteUnit(id: number) {
  const files = db().prepare("SELECT stored_name FROM documents WHERE unit_id = ?").pluck().all(id) as string[];
  db().prepare("DELETE FROM units WHERE id = ?").run(id);
  cleanupOrphans(files);
}

export function listSectionUnits(sectionId: number) {
  return db()
    .prepare("SELECT * FROM units WHERE section_id = ? ORDER BY position, id")
    .all(sectionId) as UnitRow[];
}

// ───────────────────────────── documents ─────────────────────────────

export function listDocuments(unitId: number) {
  return db()
    .prepare(`SELECT ${DOC_COLUMNS} FROM documents WHERE unit_id = ? ORDER BY created_at, id`)
    .all(unitId) as DocumentRow[];
}

export interface DocumentListItem extends DocumentRow {
  has_sheet: boolean;
  note_count: number;
}

export function listDocumentsWithStatus(unitId: number): DocumentListItem[] {
  const rows = db()
    .prepare(
      `SELECT ${DOC_COLUMNS},
         EXISTS (SELECT 1 FROM sheets s WHERE s.scope = 'document' AND s.scope_id = documents.id) AS has_sheet,
         (SELECT COUNT(*) FROM notes n WHERE n.document_id = documents.id) AS note_count
       FROM documents WHERE unit_id = ? ORDER BY created_at, id`,
    )
    .all(unitId) as (DocumentRow & { has_sheet: number; note_count: number })[];
  return rows.map((r) => ({ ...r, has_sheet: Boolean(r.has_sheet) }));
}

export function getDocument(id: number) {
  return db().prepare(`SELECT ${DOC_COLUMNS} FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
}

export function getDocumentInternals(id: number) {
  return db().prepare("SELECT stored_name, text FROM documents WHERE id = ?").get(id) as
    | { stored_name: string; text: string }
    | undefined;
}

export function createDocument(input: {
  unitId: number;
  title: string;
  originalName: string;
  storedName: string;
  size: number;
  pageCount: number;
  text: string;
}) {
  const result = db()
    .prepare(
      `INSERT INTO documents (unit_id, title, original_name, stored_name, size, page_count, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.unitId, input.title, input.originalName, input.storedName, input.size, input.pageCount, input.text, now());
  const id = Number(result.lastInsertRowid);
  indexItem("document", String(id), input.title, input.text);
  return id;
}

export function updateDocument(id: number, patch: { title?: string; unitId?: number }) {
  const doc = getDocument(id);
  if (!doc) return false;
  const d = db();
  const tx = d.transaction(() => {
    if (patch.title !== undefined) {
      d.prepare("UPDATE documents SET title = ? WHERE id = ?").run(patch.title, id);
      d.prepare("UPDATE search_index SET title = ? WHERE kind = 'document' AND ref = ?").run(patch.title, String(id));
    }
    if (patch.unitId !== undefined && patch.unitId !== doc.unit_id) {
      d.prepare("UPDATE documents SET unit_id = ? WHERE id = ?").run(patch.unitId, id);
      // Notes taken on this PDF travel with it.
      d.prepare("UPDATE notes SET unit_id = ? WHERE document_id = ?").run(patch.unitId, id);
    }
  });
  tx();
  return true;
}

export function deleteDocument(id: number) {
  const internals = getDocumentInternals(id);
  if (!internals) return;
  db().prepare("DELETE FROM documents WHERE id = ?").run(id);
  cleanupOrphans([internals.stored_name]);
}

export function listDocumentsWithoutImport(unitId?: number) {
  return db()
    .prepare(
      `SELECT d.id, d.unit_id, d.title, d.stored_name FROM documents d
       WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.document_id = d.id AND n.kind = 'import')
       ${unitId === undefined ? "" : "AND d.unit_id = ?"}`,
    )
    .all(...(unitId === undefined ? [] : [unitId])) as { id: number; unit_id: number; title: string; stored_name: string }[];
}

// ───────────────────────────── notes ─────────────────────────────

export function listNotes(unitId: number) {
  return db()
    .prepare("SELECT * FROM notes WHERE unit_id = ? ORDER BY updated_at DESC, id DESC")
    .all(unitId) as NoteRow[];
}

export function getNote(id: number) {
  return db().prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
}

export function getImportNote(documentId: number) {
  return db().prepare("SELECT * FROM notes WHERE document_id = ? AND kind = 'import'").get(documentId) as NoteRow | undefined;
}

export function createNote(input: { unitId: number; documentId: number | null; title: string; content: string; kind?: NoteKind }) {
  const ts = now();
  const result = db()
    .prepare("INSERT INTO notes (unit_id, document_id, kind, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(input.unitId, input.documentId, input.kind ?? "note", input.title, input.content, ts, ts);
  const id = Number(result.lastInsertRowid);
  indexItem("note", String(id), input.title, htmlToText(input.content));
  return getNote(id)!;
}

/**
 * Creates (or replaces the text of) the editable note for a PDF. `imported_at` matches
 * the note's `updated_at`, so a later `updated_at` means the student has edited it.
 */
export function setImportContent(documentId: number, html: string, method: "local" | "claude" | "") {
  const doc = getDocument(documentId);
  if (!doc) return undefined;
  const d = db();
  const ts = now();
  const existing = getImportNote(documentId);
  let noteId: number;
  d.transaction(() => {
    if (existing) {
      d.prepare("UPDATE notes SET content = ?, updated_at = ? WHERE id = ?").run(html, ts, existing.id);
      noteId = existing.id;
    } else {
      noteId = Number(
        d
          .prepare("INSERT INTO notes (unit_id, document_id, kind, title, content, created_at, updated_at) VALUES (?, ?, 'import', ?, ?, ?, ?)")
          .run(doc.unit_id, documentId, doc.title, html, ts, ts).lastInsertRowid,
      );
    }
    d.prepare("UPDATE documents SET import_method = ?, imported_at = ? WHERE id = ?").run(method, ts, documentId);
  })();
  // The note is now the searchable copy of the PDF; keep the raw text only when there is no note text.
  indexItem("note", String(noteId!), doc.title, htmlToText(html));
  if (htmlToText(html).trim()) unindex("document", String(documentId));
  return getNote(noteId!)!;
}

export function updateNote(id: number, patch: { title?: string; content?: string }) {
  const note = getNote(id);
  if (!note) return undefined;
  const next = { ...note, ...patch, updated_at: now() };
  const d = db();
  d.transaction(() => {
    d.prepare("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?").run(next.title, next.content, next.updated_at, id);
    // An imported PDF and its note share one title.
    if (note.kind === "import" && note.document_id && patch.title !== undefined && patch.title.trim()) {
      d.prepare("UPDATE documents SET title = ? WHERE id = ?").run(patch.title.trim(), note.document_id);
    }
  })();
  indexItem("note", String(id), next.title, htmlToText(next.content));
  return next;
}

export function deleteNote(id: number) {
  const note = getNote(id);
  if (note?.kind === "import" && note.document_id) {
    deleteDocument(note.document_id);
    return;
  }
  db().prepare("DELETE FROM notes WHERE id = ?").run(id);
  unindex("note", String(id));
}

// ───────────────────────────── sheets ─────────────────────────────

export function getSheet(scope: SheetScope, scopeId: number) {
  return db().prepare("SELECT * FROM sheets WHERE scope = ? AND scope_id = ?").get(scope, scopeId) as SheetRow | undefined;
}

export function scopeExists(scope: SheetScope, id: number) {
  const table = scope === "document" ? "documents" : scope === "unit" ? "units" : "sections";
  return Boolean(db().prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
}

/** Fingerprint of a sheet's inputs; a mismatch means the sheet is out of date. */
export function sourcesSignature(scope: SheetScope, scopeId: number): string {
  const d = db();
  let parts: string[];
  if (scope === "document") {
    parts = [`doc:${scopeId}`];
  } else if (scope === "unit") {
    const docs = d.prepare("SELECT id FROM documents WHERE unit_id = ? ORDER BY id").pluck().all(scopeId);
    const notes = d
      .prepare("SELECT id || '@' || updated_at FROM notes WHERE unit_id = ? AND content != '' ORDER BY id")
      .pluck()
      .all(scopeId);
    parts = [`d:${docs.join(",")}`, `n:${notes.join(",")}`];
  } else {
    parts = d
      .prepare(
        `SELECT u.id || '@' || s.updated_at FROM units u JOIN sheets s ON s.scope = 'unit' AND s.scope_id = u.id
         WHERE u.section_id = ? ORDER BY u.id`,
      )
      .pluck()
      .all(scopeId) as string[];
  }
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function sheetTitle(scope: SheetScope, scopeId: number) {
  if (scope === "document") return `${getDocument(scopeId)?.title ?? "Document"} — condensed`;
  if (scope === "unit") return `${getUnitContext(scopeId)?.unit.name ?? "Unit"} — study sheet`;
  return `${getSection(scopeId)?.name ?? "Section"} — exam review`;
}

export function saveGeneratedSheet(scope: SheetScope, scopeId: number, html: string, sig: string) {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO sheets (scope, scope_id, content, sources_sig, generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (scope, scope_id) DO UPDATE SET
         content = excluded.content, sources_sig = excluded.sources_sig,
         generated_at = excluded.generated_at, updated_at = excluded.updated_at`,
    )
    .run(scope, scopeId, html, sig, ts, ts);
  indexItem("sheet", `${scope}:${scopeId}`, sheetTitle(scope, scopeId), htmlToText(html));
  return getSheet(scope, scopeId)!;
}

export function updateSheetContent(scope: SheetScope, scopeId: number, html: string) {
  const existing = getSheet(scope, scopeId);
  const ts = now();
  if (existing) {
    db().prepare("UPDATE sheets SET content = ?, updated_at = ? WHERE id = ?").run(html, ts, existing.id);
  } else {
    db()
      .prepare("INSERT INTO sheets (scope, scope_id, content, sources_sig, generated_at, updated_at) VALUES (?, ?, ?, '', ?, ?)")
      .run(scope, scopeId, html, ts, ts);
  }
  indexItem("sheet", `${scope}:${scopeId}`, sheetTitle(scope, scopeId), htmlToText(html));
  return getSheet(scope, scopeId)!;
}

export function deleteSheet(scope: SheetScope, scopeId: number) {
  db().prepare("DELETE FROM sheets WHERE scope = ? AND scope_id = ?").run(scope, scopeId);
  unindex("sheet", `${scope}:${scopeId}`);
}

// ───────────────────────────── search ─────────────────────────────

export const MARK_START = "";
export const MARK_END = "";

function toFtsQuery(q: string) {
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/["*^():]/g, ""))
    .filter(Boolean);
  if (!terms.length) return null;
  return terms.map((t, i) => `"${t}"${i === terms.length - 1 ? "*" : ""}`).join(" ");
}

export function search(q: string, limit = 25): SearchHit[] {
  const fts = toFtsQuery(q);
  if (!fts) return [];
  const rows = db()
    .prepare(
      `SELECT kind, ref, title,
         snippet(search_index, 3, '${MARK_START}', '${MARK_END}', '…', 14) AS snippet
       FROM search_index WHERE search_index MATCH ? ORDER BY bm25(search_index, 0, 0, 6, 1) LIMIT ?`,
    )
    .all(fts, limit) as { kind: SearchHit["kind"]; ref: string; title: string; snippet: string }[];

  return rows.flatMap((r): SearchHit[] => {
    if (r.kind === "document") {
      const doc = getDocument(Number(r.ref));
      const ctx = doc && getUnitContext(doc.unit_id);
      if (!doc || !ctx) return [];
      return [{ kind: "document", title: r.title, snippet: r.snippet, href: `/documents/${doc.id}`, context: `${ctx.klass.name} › ${ctx.unit.name}` }];
    }
    if (r.kind === "note") {
      const note = getNote(Number(r.ref));
      const ctx = note && getUnitContext(note.unit_id);
      if (!note || !ctx) return [];
      return [
        {
          kind: note.kind === "import" ? "document" : "note",
          title: r.title || "Untitled note",
          snippet: r.snippet,
          href: `/units/${note.unit_id}?tab=notes&note=${note.id}`,
          context: `${ctx.klass.name} › ${ctx.unit.name}`,
        },
      ];
    }
    const [scope, id] = r.ref.split(":");
    const scopeId = Number(id);
    if (scope === "document") {
      const doc = getDocument(scopeId);
      return doc ? [{ kind: "sheet", title: r.title, snippet: r.snippet, href: `/documents/${scopeId}?panel=sheet`, context: "Condensed PDF" }] : [];
    }
    if (scope === "unit") {
      const ctx = getUnitContext(scopeId);
      return ctx ? [{ kind: "sheet", title: r.title, snippet: r.snippet, href: `/units/${scopeId}?tab=sheet`, context: `${ctx.klass.name} › ${ctx.section.name}` }] : [];
    }
    const section = getSection(scopeId);
    const klass = section && getClass(section.class_id);
    return section && klass
      ? [{ kind: "sheet", title: r.title, snippet: r.snippet, href: `/sections/${scopeId}`, context: klass.name }]
      : [];
  });
}
