// Shared, client-safe types.

export type SheetScope = "document" | "unit" | "section";

export interface ClassRow {
  id: number;
  name: string;
  code: string;
  color: string;
  position: number;
  created_at: string;
}

export interface SectionRow {
  id: number;
  class_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface UnitRow {
  id: number;
  section_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface DocumentRow {
  id: number;
  unit_id: number;
  title: string;
  original_name: string;
  size: number;
  page_count: number;
  /** How the PDF became an editable note: "local" extraction, "claude" transcription, or "" (no text yet). */
  import_method: string;
  imported_at: string;
  created_at: string;
}

/** "note" is written by the student; "import" is a PDF turned into editable text. */
export type NoteKind = "note" | "import";

export interface NoteRow {
  id: number;
  unit_id: number;
  document_id: number | null;
  kind: NoteKind;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface SheetRow {
  id: number;
  scope: SheetScope;
  scope_id: number;
  content: string;
  sources_sig: string;
  generated_at: string;
  updated_at: string;
}

/** A sheet plus what the UI needs to know about it. */
export interface SheetState {
  sheet: SheetRow | null;
  stale: boolean;
  running: boolean;
}

/** A PDF as the notes workspace sees it. */
export interface WorkspaceDocument extends DocumentRow {
  condensing: boolean;
  transcribing: boolean;
  sheet: SheetState;
}

export interface UnitNode extends UnitRow {
  doc_count: number;
  note_count: number;
  has_sheet: boolean;
}

export interface SectionNode extends SectionRow {
  units: UnitNode[];
}

export interface ClassNode extends ClassRow {
  sections: SectionNode[];
}

export interface UnitContext {
  unit: UnitRow;
  section: SectionRow;
  klass: ClassRow;
}

export interface SearchHit {
  kind: "document" | "note" | "sheet";
  title: string;
  snippet: string;
  href: string;
  context: string;
}

export const EVENT_KINDS = ["lecture", "exam", "quiz", "assignment", "study", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface CalendarEvent {
  id: number;
  source: "manual" | "canvas";
  title: string;
  kind: EventKind;
  class_id: number | null;
  unit_id: number | null;
  /** ISO timestamp, or YYYY-MM-DD for all-day events. */
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  /** Sanitized HTML. */
  description: string;
  url: string;
  points: number | null;
  /** Estimated percent of the final grade. */
  weight: number | null;
  group_name: string;
  group_weight: number | null;
  course_label: string;
  submission_status: string;
  score: number | null;
  my_notes: string;
  done: boolean;
  synced_at: string | null;
}

export interface CourseLink {
  course_key: string;
  label: string;
  class_id: number | null;
  event_count: number;
}

export interface CanvasStatus {
  feedUrl: string | null;
  apiBaseUrl: string | null;
  tokenHint: string | null;
  lastSync: { at: string; ok: boolean; message: string; events: number } | null;
  syncing: boolean;
  courses: CourseLink[];
}

export type JobStatus = "queued" | "reading" | "thinking" | "writing";

/** Events streamed (as NDJSON) while a study sheet is generated. */
export type JobEvent =
  | { t: "status"; v: JobStatus }
  | { t: "delta"; v: string }
  | { t: "done"; html: string; warning?: string }
  | { t: "error"; message: string }
  | { t: "idle" };
