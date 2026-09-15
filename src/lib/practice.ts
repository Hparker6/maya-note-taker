import "server-only";
import { dedupeKey, extractCards } from "./card-extract";
import { addDays } from "./day";
import { db, now } from "./db";
import { DAILY_GOAL_XP, levelOf, schedule, type Rating } from "./practice-shared";
import { getSheet, getUnitContext, listDocuments, listNotes } from "./repo";
import type {
  CardKind,
  CardRow,
  CardSource,
  PracticeStats,
  QuizQuestionRow,
  SessionItem,
  StreakInfo,
  StudyMode,
  StudySession,
  UnitPracticeSummary,
} from "./types";

const CARD_COLUMNS =
  "c.id, c.unit_id, c.kind, c.front, c.back, c.source, c.origin, c.ease, c.interval_days, c.reps, c.lapses, c.due_day, c.last_reviewed_at, c.created_at, c.updated_at";

export const MAX_CARD_FRONT = 300;
export const MAX_CARD_BACK = 700;
const REVIEW_SESSION = 20;
const NEW_PER_SESSION = 10;
const CRAM_SESSION = 50;
const QUIZ_SIZE = 10;

// ───────────────────────────── cards ─────────────────────────────

export function listCards(unitId: number): CardRow[] {
  return db().prepare(`SELECT ${CARD_COLUMNS} FROM cards c WHERE c.unit_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(unitId) as CardRow[];
}

export function getCard(id: number) {
  return db().prepare(`SELECT ${CARD_COLUMNS} FROM cards c WHERE c.id = ?`).get(id) as CardRow | undefined;
}

function unitKeys(unitId: number) {
  return new Set(db().prepare("SELECT dedupe_key FROM cards WHERE unit_id = ?").pluck().all(unitId) as string[]);
}

export function createCard(input: { unitId: number; front: string; back: string; kind?: CardKind; source?: CardSource; origin?: string }) {
  const at = now();
  const result = db()
    .prepare(
      "INSERT INTO cards (unit_id, kind, front, back, source, origin, dedupe_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.unitId, input.kind ?? "basic", input.front, input.back, input.source ?? "manual", input.origin ?? "", dedupeKey(input.front), at, at);
  return Number(result.lastInsertRowid);
}

export function updateCard(id: number, patch: { front?: string; back?: string }) {
  const card = getCard(id);
  if (!card) return undefined;
  const front = patch.front ?? card.front;
  const back = patch.back ?? card.back;
  // A card edited to have no blank is a basic card.
  const kind: CardKind = card.kind === "cloze" && !front.includes("___") ? "basic" : card.kind;
  db()
    .prepare("UPDATE cards SET front = ?, back = ?, kind = ?, dedupe_key = ?, updated_at = ? WHERE id = ?")
    .run(front, back, kind, dedupeKey(front), now(), id);
  return getCard(id);
}

export function resetCard(id: number) {
  db().prepare("UPDATE cards SET ease = 2.5, interval_days = 0, reps = 0, lapses = 0, due_day = '', last_reviewed_at = '', updated_at = ? WHERE id = ?").run(now(), id);
  return getCard(id);
}

export function deleteCard(id: number) {
  return db().prepare("DELETE FROM cards WHERE id = ?").run(id).changes > 0;
}

export function reviewCard(id: number, rating: Rating, today: string) {
  const card = getCard(id);
  if (!card) return undefined;
  const next = schedule(card, rating);
  const at = now();
  db()
    .prepare("UPDATE cards SET ease = ?, interval_days = ?, reps = ?, lapses = ?, due_day = ?, last_reviewed_at = ?, updated_at = ? WHERE id = ?")
    .run(next.ease, next.interval_days, next.reps, next.lapses, addDays(today, next.interval_days), at, at, id);
  return getCard(id);
}

/** Finds cards in every note and study sheet of a unit and adds the ones it doesn't have yet. */
export function addCardsFromNotes(unitId: number) {
  const sources: { title: string; html: string }[] = [
    ...listNotes(unitId).map((n) => ({ title: n.title || "Untitled note", html: n.content })),
    ...listDocuments(unitId).flatMap((d) => {
      const sheet = getSheet("document", d.id);
      return sheet ? [{ title: `${d.title} (condensed)`, html: sheet.content }] : [];
    }),
  ];
  const unitSheet = getSheet("unit", unitId);
  if (unitSheet) sources.push({ title: "Unit study sheet", html: unitSheet.content });

  const keys = unitKeys(unitId);
  let found = 0;
  let added = 0;
  db().transaction(() => {
    for (const source of sources) {
      for (const card of extractCards(source.html)) {
        found++;
        const key = dedupeKey(card.front);
        if (!key || keys.has(key)) continue;
        keys.add(key);
        createCard({ unitId, ...card, source: "notes", origin: source.title });
        added++;
      }
    }
  })();
  return { found, added, total: countCards(unitId) };
}

const countCards = (unitId: number) => (db().prepare("SELECT COUNT(*) FROM cards WHERE unit_id = ?").pluck().get(unitId) as number) ?? 0;

export function addAiCards(unitId: number, cards: { front: string; back: string }[], origin: string) {
  const keys = unitKeys(unitId);
  let added = 0;
  db().transaction(() => {
    for (const c of cards) {
      const front = c.front.trim().slice(0, MAX_CARD_FRONT);
      const back = c.back.trim().slice(0, MAX_CARD_BACK);
      const key = dedupeKey(front);
      if (!front || !back || !key || keys.has(key)) continue;
      keys.add(key);
      createCard({ unitId, front, back, kind: front.includes("___") ? "cloze" : "basic", source: "ai", origin });
      added++;
    }
  })();
  return added;
}

// ───────────────────────────── quiz questions ─────────────────────────────

interface QuestionDbRow extends Omit<QuizQuestionRow, "choices"> {
  choices: string;
}

const parseQuestion = (r: QuestionDbRow): QuizQuestionRow => ({ ...r, choices: JSON.parse(r.choices) as string[] });

export function listQuestions(unitId: number): QuizQuestionRow[] {
  return (db().prepare("SELECT * FROM quiz_questions WHERE unit_id = ? ORDER BY created_at DESC, id DESC").all(unitId) as QuestionDbRow[]).map(parseQuestion);
}

export function deleteQuestion(id: number) {
  return db().prepare("DELETE FROM quiz_questions WHERE id = ?").run(id).changes > 0;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function addQuestions(unitId: number, questions: { prompt: string; choices: string[]; answer: number; explanation: string }[]) {
  const d = db();
  const keys = new Set(d.prepare("SELECT dedupe_key FROM quiz_questions WHERE unit_id = ?").pluck().all(unitId) as string[]);
  let added = 0;
  d.transaction(() => {
    for (const q of questions) {
      const prompt = q.prompt.trim().slice(0, 600);
      const choices = q.choices.map((c) => c.trim().slice(0, 300));
      const key = dedupeKey(prompt);
      const unique = new Set(choices.map((c) => c.toLowerCase()));
      if (!prompt || !key || keys.has(key)) continue;
      if (choices.length < 3 || choices.length > 6 || unique.size !== choices.length || choices.some((c) => !c)) continue;
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= choices.length) continue;
      // Models favor certain answer positions; shuffle so position carries no signal.
      const correct = choices[q.answer];
      const shuffled = shuffle(choices);
      keys.add(key);
      d.prepare("INSERT INTO quiz_questions (unit_id, prompt, choices, answer, explanation, source, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?)").run(
        unitId,
        prompt,
        JSON.stringify(shuffled),
        shuffled.indexOf(correct),
        q.explanation.trim().slice(0, 600),
        key,
        now(),
      );
      added++;
    }
  })();
  return added;
}

// ───────────────────────────── stats ─────────────────────────────

const STATS_SELECT = `
  COUNT(c.id) AS total,
  COALESCE(SUM(c.due_day = ''), 0) AS new,
  COALESCE(SUM(c.due_day != '' AND c.due_day <= @today), 0) AS due,
  COALESCE(SUM(c.due_day != '' AND c.interval_days < 7), 0) AS learning,
  COALESCE(SUM(c.due_day != '' AND c.interval_days >= 7 AND c.interval_days < 21), 0) AS known,
  COALESCE(SUM(c.due_day != '' AND c.interval_days >= 21), 0) AS mastered`;

export function unitStats(unitId: number, today: string): PracticeStats {
  return db().prepare(`SELECT ${STATS_SELECT} FROM cards c WHERE c.unit_id = @unit`).get({ unit: unitId, today }) as PracticeStats;
}

export function totalStats(today: string, classId?: number): PracticeStats {
  return db()
    .prepare(
      `SELECT ${STATS_SELECT} FROM cards c JOIN units u ON u.id = c.unit_id JOIN sections s ON s.id = u.section_id
       ${classId ? "WHERE s.class_id = @class" : ""}`,
    )
    .get({ today, class: classId ?? null }) as PracticeStats;
}

/** Every unit that has cards or quiz questions, in sidebar order. */
export function practiceSummaries(today: string): UnitPracticeSummary[] {
  const rows = db()
    .prepare(
      `SELECT u.id AS unitId, u.name AS unitName, s.name AS sectionName, k.id AS classId, k.name AS className, k.color AS classColor,
         (SELECT COUNT(*) FROM quiz_questions q WHERE q.unit_id = u.id) AS questions,
         ${STATS_SELECT}
       FROM units u
       JOIN sections s ON s.id = u.section_id
       JOIN classes k ON k.id = s.class_id
       LEFT JOIN cards c ON c.unit_id = u.id
       GROUP BY u.id
       HAVING total > 0 OR questions > 0
       ORDER BY k.position, k.id, s.position, s.id, u.position, u.id`,
    )
    .all({ today }) as (Omit<UnitPracticeSummary, "stats"> & PracticeStats)[];
  return rows.map(({ unitId, unitName, sectionName, classId, className, classColor, questions, ...stats }) => ({
    unitId,
    unitName,
    sectionName,
    classId,
    className,
    classColor,
    questions,
    stats,
  }));
}

// ───────────────────────────── sessions ─────────────────────────────

export interface SessionScope {
  unitId?: number;
  classId?: number;
}

interface ScopedCard extends CardRow {
  class_id: number;
  class_name: string;
  unit_name: string;
}

/** Cards in a unit, a class, or everywhere. `where` and `order` are fixed SQL fragments, never user input. */
function scopedCards(scope: SessionScope, opts: { where?: string; order?: string; today?: string } = {}): ScopedCard[] {
  const where = [scope.unitId ? "c.unit_id = @unit" : scope.classId ? "s.class_id = @class" : "1 = 1", opts.where].filter(Boolean).join(" AND ");
  return db()
    .prepare(
      `SELECT ${CARD_COLUMNS}, s.class_id AS class_id, k.name AS class_name, u.name AS unit_name
       FROM cards c JOIN units u ON u.id = c.unit_id JOIN sections s ON s.id = u.section_id JOIN classes k ON k.id = s.class_id
       WHERE ${where}
       ORDER BY ${opts.order ?? "c.id"}`,
    )
    .all({ unit: scope.unitId ?? null, class: scope.classId ?? null, today: opts.today ?? "" }) as ScopedCard[];
}

const contextOf = (c: ScopedCard, scope: SessionScope) =>
  [scope.unitId ? "" : `${c.class_name} › ${c.unit_name}`, c.origin].filter(Boolean).join(" · ");

function scopeTitle(scope: SessionScope) {
  if (scope.unitId) return getUnitContext(scope.unitId)?.unit.name ?? "Practice";
  if (scope.classId) return (db().prepare("SELECT name FROM classes WHERE id = ?").pluck().get(scope.classId) as string | undefined) ?? "Practice";
  return "Daily review";
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const norm = (s: string) => dedupeKey(s);

/** Hides the term inside its own definition so the question doesn't give the answer away. */
function maskTerm(text: string, term: string) {
  if (term.length < 3) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "_____");
}

function pickDistractors(correct: string, candidates: string[], exclude: Set<string>, count = 3) {
  const seen = new Set([norm(correct), ...exclude]);
  const pool: string[] = [];
  for (const c of candidates) {
    const key = norm(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pool.push(c);
  }
  // Prefer options of similar length so the right answer doesn't stand out.
  return pool
    .map((c) => ({ c, score: Math.abs(c.length - correct.length) / Math.max(10, correct.length) + Math.random() * 0.6 }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((x) => x.c);
}

function mcq(base: { key: string; label: string; prompt: string; cardId?: number; context: string }, correct: string, distractors: string[]): SessionItem {
  const choices = shuffle([correct, ...distractors]);
  return { type: "mcq", ...base, choices, answer: choices.indexOf(correct) };
}

function cardQuestion(card: ScopedCard, pool: ScopedCard[], scope: SessionScope): SessionItem | null {
  const context = contextOf(card, scope);
  const others = pool.filter((p) => p.id !== card.id);
  const r = Math.random();

  if (card.kind === "list") {
    const items = card.back.split("\n").map((s) => s.trim()).filter(Boolean);
    const own = new Set(items.map(norm));
    const correct = items[Math.floor(Math.random() * items.length)];
    const candidates = shuffle(others.flatMap((o) => (o.kind === "list" ? o.back.split("\n") : o.kind === "basic" ? [o.front] : []))).filter((s) => words(s) <= 10);
    const distractors = pickDistractors(correct, candidates, own);
    if (distractors.length < 3) return null;
    return mcq({ key: `list:${card.id}`, label: "Which one belongs here?", prompt: card.front, cardId: card.id, context }, correct, distractors);
  }

  if (card.kind === "cloze") {
    if (card.back.length <= 30 && r < 0.35) return { type: "typed", key: `typed:${card.id}`, label: "Fill in the blank", prompt: card.front, answer: card.back, cardId: card.id, context };
    const candidates = shuffle(others.flatMap((o) => (o.kind === "cloze" ? [o.back] : o.kind === "basic" && o.front.length <= 60 ? [o.front] : [])));
    const distractors = pickDistractors(card.back, candidates, new Set());
    if (distractors.length < 3) return card.back.length <= 40 ? { type: "typed", key: `typed:${card.id}`, label: "Fill in the blank", prompt: card.front, answer: card.back, cardId: card.id, context } : null;
    return mcq({ key: `cloze:${card.id}`, label: "Fill in the blank", prompt: card.front, cardId: card.id, context }, card.back, distractors);
  }

  const shortTerm = card.front.length <= 40 && words(card.front) <= 5;
  const definition = maskTerm(card.back, card.front);
  if (shortTerm && r < 0.25) return { type: "typed", key: `typed:${card.id}`, label: "Type the term", prompt: definition, answer: card.front, cardId: card.id, context };

  if (r < 0.6 || !shortTerm) {
    // Term → meaning
    const candidates = shuffle(others.filter((o) => o.kind === "basic").map((o) => clip(maskTerm(o.back, o.front), 240)));
    const distractors = pickDistractors(clip(card.back, 240), candidates, new Set());
    if (distractors.length >= 3) return mcq({ key: `meaning:${card.id}`, label: "What does this mean?", prompt: card.front, cardId: card.id, context }, clip(card.back, 240), distractors);
  }
  // Meaning → term
  const candidates = shuffle(others.filter((o) => o.kind === "basic" && o.front.length <= 90).map((o) => o.front));
  const distractors = pickDistractors(card.front, candidates, new Set());
  if (distractors.length >= 3) return mcq({ key: `term:${card.id}`, label: "Which term matches?", prompt: definition, cardId: card.id, context }, card.front, distractors);
  if (shortTerm) return { type: "typed", key: `typed:${card.id}`, label: "Type the term", prompt: definition, answer: card.front, cardId: card.id, context };
  return null;
}

export function buildSession(mode: StudyMode, scope: SessionScope, today: string): StudySession {
  const title = scopeTitle(scope);
  const unitId = scope.unitId ?? null;

  if (mode === "review") {
    const due = scopedCards(scope, { where: "c.due_day != '' AND c.due_day <= @today", today, order: "c.due_day, c.interval_days, c.id" });
    const fresh = scopedCards(scope, { where: "c.due_day = ''", order: "c.created_at, c.id" });
    const dueTake = due.slice(0, REVIEW_SESSION);
    const newTake = fresh.slice(0, Math.min(NEW_PER_SESSION, REVIEW_SESSION - dueTake.length));
    // New cards are sprinkled between reviews so the session doesn't end on a wall of unknowns.
    const ordered: ScopedCard[] = [...dueTake];
    newTake.forEach((card, i) => ordered.splice(Math.min(ordered.length, (i + 1) * 2 + i), 0, card));
    return {
      mode,
      title,
      unitId,
      items: ordered.map((card) => ({ type: "card", key: `card:${card.id}`, card, context: contextOf(card, scope) })),
      remaining: due.length + fresh.length - ordered.length,
    };
  }

  if (mode === "cram") {
    const all = shuffle(scopedCards(scope));
    const take = all.slice(0, CRAM_SESSION);
    return {
      mode,
      title,
      unitId,
      items: take.map((card) => ({ type: "card", key: `card:${card.id}`, card, context: contextOf(card, scope) })),
      remaining: all.length - take.length,
    };
  }

  // Quiz: saved AI questions (least seen and most missed first) plus questions built from flashcards.
  const where = scope.unitId ? "q.unit_id = @unit" : scope.classId ? "s.class_id = @class" : "1 = 1";
  const questions = (
    db()
      .prepare(
        `SELECT q.*, k.name AS class_name, u.name AS unit_name FROM quiz_questions q
         JOIN units u ON u.id = q.unit_id JOIN sections s ON s.id = u.section_id JOIN classes k ON k.id = s.class_id
         WHERE ${where}`,
      )
      .all({ unit: scope.unitId ?? null, class: scope.classId ?? null }) as (QuestionDbRow & { class_name: string; unit_name: string })[]
  )
    .map((q) => ({ q, score: q.times_seen - 2 * (q.times_seen - q.times_correct) + Math.random() * 2 }))
    .sort((a, b) => a.score - b.score)
    .map(({ q }) => q);

  const cards = scopedCards(scope);
  // Distractors come from the whole class so small units still get good options.
  const classIds = [...new Set(cards.map((c) => c.class_id))];
  const pool = classIds.length === 1 && scope.unitId ? scopedCards({ classId: classIds[0] }) : cards;

  const fromCards: SessionItem[] = [];
  const weakFirst = [...cards].sort(
    (a, b) => b.lapses - a.lapses || a.interval_days - b.interval_days || Math.random() - 0.5,
  );
  for (const card of weakFirst.slice(0, 40)) {
    if (fromCards.length >= QUIZ_SIZE) break;
    const item = cardQuestion(card, pool, scope);
    if (item) fromCards.push(item);
  }

  const aiCount = Math.min(questions.length, fromCards.length ? Math.max(QUIZ_SIZE - fromCards.length, Math.ceil(QUIZ_SIZE * 0.6)) : QUIZ_SIZE);
  const items: SessionItem[] = questions.slice(0, aiCount).map((raw) => {
    const q = parseQuestion(raw);
    return {
      type: "mcq",
      key: `q:${q.id}`,
      label: "Choose the best answer",
      prompt: q.prompt,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation || undefined,
      questionId: q.id,
      context: scope.unitId ? "" : `${raw.class_name} › ${raw.unit_name}`,
    };
  });
  items.push(...fromCards.slice(0, QUIZ_SIZE - items.length));
  return { mode, title, unitId, items: shuffle(items), remaining: 0 };
}

// ───────────────────────────── study log & streaks ─────────────────────────────

export function logStudy(input: {
  day: string;
  unitId: number | null;
  mode: StudyMode;
  items: number;
  correct: number;
  xp: number;
  seconds: number;
  missedCardIds: number[];
  questionResults: { id: number; correct: boolean }[];
}) {
  const d = db();
  d.transaction(() => {
    const unitExists = input.unitId && d.prepare("SELECT 1 FROM units WHERE id = ?").get(input.unitId);
    d.prepare("INSERT INTO study_log (day, unit_id, mode, items, correct, xp, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      input.day,
      unitExists ? input.unitId : null,
      input.mode,
      input.items,
      input.correct,
      input.xp,
      input.seconds,
      now(),
    );
    // Missing a quiz question about a card brings that card back into today's review.
    const miss = d.prepare("UPDATE cards SET due_day = ?, interval_days = MIN(interval_days, 1), updated_at = ? WHERE id = ? AND (due_day = '' OR due_day > ?)");
    for (const id of input.missedCardIds) miss.run(input.day, now(), id, input.day);
    const answer = d.prepare("UPDATE quiz_questions SET times_seen = times_seen + 1, times_correct = times_correct + ? WHERE id = ?");
    for (const r of input.questionResults) answer.run(r.correct ? 1 : 0, r.id);
  })();
  return streakInfo(input.day);
}

export function streakInfo(today: string): StreakInfo {
  const days = db().prepare("SELECT day, SUM(xp) AS xp FROM study_log GROUP BY day HAVING SUM(xp) > 0 ORDER BY day DESC").all() as { day: string; xp: number }[];
  const xpByDay = new Map(days.map((r) => [r.day, r.xp]));
  const practicedToday = xpByDay.has(today);
  let streak = 0;
  // A streak survives until the end of the day after the last practice.
  for (let day = practicedToday ? today : addDays(today, -1); xpByDay.has(day); day = addDays(day, -1)) streak++;
  return {
    streak,
    practicedToday,
    xpToday: xpByDay.get(today) ?? 0,
    goal: DAILY_GOAL_XP,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, xp: xpByDay.get(day) ?? 0 };
    }),
  };
}

export { levelOf };
