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

// Applied in order on top of SCHEMA; PRAGMA user_version records how many have run.
const MIGRATIONS: string[] = [
  // 1: PDFs become editable notes ("imports") alongside the student's own notes.
  `
  ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
  ALTER TABLE documents ADD COLUMN import_method TEXT NOT NULL DEFAULT '';
  ALTER TABLE documents ADD COLUMN imported_at TEXT NOT NULL DEFAULT '';
  CREATE INDEX IF NOT EXISTS idx_notes_document ON notes(document_id);
  `,
  // 2: calendar events (manual + Canvas) and app settings.
  `
  CREATE TABLE IF NOT EXISTS events (
    id                INTEGER PRIMARY KEY,
    source            TEXT NOT NULL DEFAULT 'manual',
    external_key      TEXT UNIQUE,
    title             TEXT NOT NULL,
    kind              TEXT NOT NULL DEFAULT 'other',
    kind_locked       INTEGER NOT NULL DEFAULT 0,
    class_id          INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    class_locked      INTEGER NOT NULL DEFAULT 0,
    unit_id           INTEGER REFERENCES units(id) ON DELETE SET NULL,
    starts_at         TEXT NOT NULL,
    ends_at           TEXT,
    all_day           INTEGER NOT NULL DEFAULT 0,
    location          TEXT NOT NULL DEFAULT '',
    description       TEXT NOT NULL DEFAULT '',
    url               TEXT NOT NULL DEFAULT '',
    points            REAL,
    weight            REAL,
    group_name        TEXT NOT NULL DEFAULT '',
    group_weight      REAL,
    course_key        TEXT NOT NULL DEFAULT '',
    course_label      TEXT NOT NULL DEFAULT '',
    submission_status TEXT NOT NULL DEFAULT '',
    score             REAL,
    my_notes          TEXT NOT NULL DEFAULT '',
    done              INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    synced_at         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS course_links (
    course_key TEXT PRIMARY KEY,
    label      TEXT NOT NULL DEFAULT '',
    class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL
  );
  `,
  // 3: practice (spaced-repetition flashcards, quiz questions, study log); AI is provider-neutral now.
  `
  CREATE TABLE IF NOT EXISTS cards (
    id                INTEGER PRIMARY KEY,
    unit_id           INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    kind              TEXT NOT NULL DEFAULT 'basic',
    front             TEXT NOT NULL,
    back              TEXT NOT NULL,
    source            TEXT NOT NULL DEFAULT 'manual',
    origin            TEXT NOT NULL DEFAULT '',
    dedupe_key        TEXT NOT NULL DEFAULT '',
    ease              REAL NOT NULL DEFAULT 2.5,
    interval_days     INTEGER NOT NULL DEFAULT 0,
    reps              INTEGER NOT NULL DEFAULT 0,
    lapses            INTEGER NOT NULL DEFAULT 0,
    due_day           TEXT NOT NULL DEFAULT '',
    last_reviewed_at  TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cards_unit ON cards(unit_id);
  CREATE TABLE IF NOT EXISTS quiz_questions (
    id             INTEGER PRIMARY KEY,
    unit_id        INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    prompt         TEXT NOT NULL,
    choices        TEXT NOT NULL,
    answer         INTEGER NOT NULL,
    explanation    TEXT NOT NULL DEFAULT '',
    source         TEXT NOT NULL DEFAULT 'ai',
    dedupe_key     TEXT NOT NULL DEFAULT '',
    times_seen     INTEGER NOT NULL DEFAULT 0,
    times_correct  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_questions_unit ON quiz_questions(unit_id);
  CREATE TABLE IF NOT EXISTS study_log (
    id          INTEGER PRIMARY KEY,
    day         TEXT NOT NULL,
    unit_id     INTEGER REFERENCES units(id) ON DELETE SET NULL,
    mode        TEXT NOT NULL,
    items       INTEGER NOT NULL DEFAULT 0,
    correct     INTEGER NOT NULL DEFAULT 0,
    xp          INTEGER NOT NULL DEFAULT 0,
    seconds     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_study_log_day ON study_log(day);
  UPDATE documents SET import_method = 'ai' WHERE import_method = 'claude';
  `,
  // 4: handwriting drawn on the note page, and roomier line spacing for writing between lines.
  `
  ALTER TABLE notes ADD COLUMN ink TEXT NOT NULL DEFAULT '';
  ALTER TABLE notes ADD COLUMN line_spacing TEXT NOT NULL DEFAULT '';
  `,
  // 5: grades from Canvas — every graded assignment (dated or not) and each course's overall grade.
  `
  CREATE TABLE IF NOT EXISTS grade_items (
    key              TEXT PRIMARY KEY,
    course_key       TEXT NOT NULL,
    name             TEXT NOT NULL,
    group_name       TEXT NOT NULL DEFAULT '',
    group_position   INTEGER NOT NULL DEFAULT 0,
    group_weight     REAL,
    points_possible  REAL,
    score            REAL,
    grade            TEXT NOT NULL DEFAULT '',
    weight           REAL,
    status           TEXT NOT NULL DEFAULT '',
    due_at           TEXT,
    url              TEXT NOT NULL DEFAULT '',
    counts           INTEGER NOT NULL DEFAULT 1,
    position         INTEGER NOT NULL DEFAULT 0,
    synced_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_grade_items_course ON grade_items(course_key);
  ALTER TABLE course_links ADD COLUMN current_score REAL;
  ALTER TABLE course_links ADD COLUMN current_grade TEXT NOT NULL DEFAULT '';
  ALTER TABLE course_links ADD COLUMN final_score REAL;
  ALTER TABLE course_links ADD COLUMN final_grade TEXT NOT NULL DEFAULT '';
  ALTER TABLE course_links ADD COLUMN weighted INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE course_links ADD COLUMN grades_synced_at TEXT;
  `,
];

declare global {
  var __mayaDb: Database.Database | undefined;
}

// The connection survives dev hot reloads, but this module doesn't; re-checking once per module
// load applies migrations added while `next dev` is running.
let migrated = false;

export function db(): Database.Database {
  if (!globalThis.__mayaDb) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const conn = new Database(path.join(DATA_DIR, "maya.db"));
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.exec(SCHEMA);
    globalThis.__mayaDb = conn;
  }
  if (!migrated) {
    const conn = globalThis.__mayaDb;
    const version = conn.pragma("user_version", { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      conn.transaction(() => {
        conn.exec(MIGRATIONS[i]);
        conn.pragma(`user_version = ${i + 1}`);
      })();
    }
    migrated = true;
  }
  return globalThis.__mayaDb;
}

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db().prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
}

export const now = () => new Date().toISOString();
