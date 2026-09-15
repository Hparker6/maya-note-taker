import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Runtime data lives outside the build; tell Turbopack not to trace it.
export const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"),
);
export const FILES_DIR = path.join(DATA_DIR, "files");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS classes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'sage',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id          INTEGER PRIMARY KEY,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY,
  section_id  INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id             INTEGER PRIMARY KEY,
  unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
  size           INTEGER NOT NULL,
  page_count     INTEGER NOT NULL DEFAULT 0,
  text           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

-- content is sanitized rich-text HTML. document_id pins a note to the PDF it was taken on.
CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY,
  unit_id     INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- AI study sheets. scope is polymorphic, so orphans are cleaned up in repo.ts.
CREATE TABLE IF NOT EXISTS sheets (
  id            INTEGER PRIMARY KEY,
  scope         TEXT NOT NULL CHECK (scope IN ('document', 'unit', 'section')),
  scope_id      INTEGER NOT NULL,
  content       TEXT NOT NULL,
  sources_sig   TEXT NOT NULL DEFAULT '',
  generated_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_sections_class ON sections(class_id);
CREATE INDEX IF NOT EXISTS idx_units_section ON units(section_id);
CREATE INDEX IF NOT EXISTS idx_documents_unit ON documents(unit_id);
CREATE INDEX IF NOT EXISTS idx_notes_unit ON notes(unit_id);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind UNINDEXED,
  ref UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61'
);
`;

declare global {
  var __mayaDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!globalThis.__mayaDb) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const conn = new Database(path.join(DATA_DIR, "maya.db"));
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.exec(SCHEMA);
    globalThis.__mayaDb = conn;
  }
  return globalThis.__mayaDb;
}

export const now = () => new Date().toISOString();
