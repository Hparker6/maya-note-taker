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
  /** How the PDF became an editable note: "local" extraction, "ai" transcription, or "" (no text yet). */
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
  /** Handwriting on the page (see lib/ink.ts); "" when there is none. */
  ink: string;
  /** "" or "roomy" (extra space between lines for writing). */
  line_spacing: string;
  created_at: string;
  /** Version of the title and text. */
  updated_at: string;
  /** Version of the handwriting and line spacing ("" until first saved). */
  ink_updated_at: string;
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

/** One Canvas assignment as it counts toward a grade. */
export interface GradeItem {
  key: string;
  name: string;
  points_possible: number | null;
  score: number | null;
  /** Letter or other grade text Canvas shows (e.g. "A-", "complete"). */
  grade: string;
  /** Estimated % of the final course grade this assignment is worth. */
  weight: number | null;
  /** graded, submitted, late, missing, excused, or "" (not submitted yet). */
  status: string;
  due_at: string | null;
  url: string;
  /** False when Canvas leaves it out of the final grade. */
  counts: boolean;
}

export interface GradeGroup {
  name: string;
  /** % of the final grade for weighted courses. */
  weight: number | null;
  /** Score on graded work in this group, 0–100; null when nothing is graded yet. */
  percent: number | null;
  earned: number;
  possible: number;
  items: GradeItem[];
}

export interface CourseGrade {
  course_key: string;
  label: string;
  class_id: number | null;
  class_name: string | null;
  class_color: string | null;
  /** Canvas's current grade on graded work (0–100), or our own estimate when Canvas doesn't say. */
  current_score: number | null;
  current_grade: string;
  /** Grade if everything ungraded counted as zero. */
  final_score: number | null;
  weighted: boolean;
  /** Share of the final grade that's graded so far, in %. */
  graded_weight: number;
  /** % of the final grade already earned (e.g. 38.5 of the 42% graded). */
  earned_weight: number;
  groups: GradeGroup[];
  synced_at: string | null;
}

export interface CanvasStatus {
  feedUrl: string | null;
  apiBaseUrl: string | null;
  tokenHint: string | null;
  lastSync: { at: string; ok: boolean; message: string; events: number } | null;
  syncing: boolean;
  courses: CourseLink[];
}

// ───────────── practice ─────────────

/** basic: term → answer; cloze: sentence with a blank; list: heading → its items. */
export type CardKind = "basic" | "cloze" | "list";
export type CardSource = "manual" | "notes" | "ai";
export type CardLevel = "new" | "learning" | "known" | "mastered";

export interface CardRow {
  id: number;
  unit_id: number;
  kind: CardKind;
  front: string;
  back: string;
  source: CardSource;
  /** Title of the note or sheet the card came from. */
  origin: string;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  /** Local YYYY-MM-DD the card is next due; "" while it has never been studied. */
  due_day: string;
  last_reviewed_at: string;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestionRow {
  id: number;
  unit_id: number;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  source: CardSource;
  times_seen: number;
  times_correct: number;
  created_at: string;
}

export interface PracticeStats {
  total: number;
  /** Never studied. */
  new: number;
  /** Studied before and due today or earlier. */
  due: number;
  learning: number;
  known: number;
  mastered: number;
}

export type StudyMode = "review" | "cram" | "quiz";

export type SessionItem =
  | { type: "card"; key: string; card: CardRow; context: string }
  | {
      type: "mcq";
      key: string;
      label: string;
      prompt: string;
      choices: string[];
      answer: number;
      explanation?: string;
      cardId?: number;
      questionId?: number;
      context: string;
    }
  | { type: "typed"; key: string; label: string; prompt: string; answer: string; cardId?: number; context: string };

export interface StudySession {
  mode: StudyMode;
  title: string;
  unitId: number | null;
  items: SessionItem[];
  /** How many more are waiting after this session (review mode). */
  remaining: number;
}

export interface StreakInfo {
  streak: number;
  practicedToday: boolean;
  xpToday: number;
  goal: number;
  /** The last 7 local days, oldest first. */
  week: { day: string; xp: number }[];
}

export interface UnitPracticeData {
  stats: PracticeStats;
  cards: CardRow[];
  questions: QuizQuestionRow[];
  generating: boolean;
}

export interface UnitPracticeSummary {
  unitId: number;
  unitName: string;
  sectionName: string;
  classId: number;
  className: string;
  classColor: string;
  stats: PracticeStats;
  questions: number;
}

export type AiProvider = "gemini" | "claude";

export interface AiStatus {
  /** The provider AI features will use right now, or null when no key is set. */
  provider: AiProvider | null;
  geminiKeyHint: string | null;
  claudeKeyHint: string | null;
  /** Keys that come from the environment can't be changed in the app. */
  geminiFromEnv: boolean;
  claudeFromEnv: boolean;
  geminiModel: string;
  claudeModel: string;
}

export type JobStatus = "queued" | "reading" | "thinking" | "writing" | "retrying";

/** Events streamed (as NDJSON) while a study sheet is generated. */
export type JobEvent =
  | { t: "status"; v: JobStatus }
  | { t: "delta"; v: string }
  | { t: "done"; html: string; warning?: string; message?: string }
  | { t: "error"; message: string }
  | { t: "idle" };
