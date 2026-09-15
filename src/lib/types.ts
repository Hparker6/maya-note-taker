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
  created_at: string;
}

export interface NoteRow {
  id: number;
  unit_id: number;
  document_id: number | null;
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

export type JobStatus = "queued" | "reading" | "thinking" | "writing";

/** Events streamed (as NDJSON) while a study sheet is generated. */
export type JobEvent =
  | { t: "status"; v: JobStatus }
  | { t: "delta"; v: string }
  | { t: "done"; html: string; warning?: string }
  | { t: "error"; message: string }
  | { t: "idle" };
