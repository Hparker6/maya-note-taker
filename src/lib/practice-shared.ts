// Client-safe spaced-repetition and answer-checking helpers shared by the server and the study session.
import type { CardLevel, CardRow } from "./types";

export type Rating = "again" | "hard" | "good" | "easy";
export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

export interface SrsState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

/** SM-2 style scheduling with whole-day intervals. "again" keeps the card due today. */
export function schedule(state: SrsState, rating: Rating): SrsState {
  let { ease, interval_days: interval, reps, lapses } = state;
  switch (rating) {
    case "again":
      if (reps > 0) lapses++;
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      break;
    case "hard":
      interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      reps++;
      break;
    case "good":
      interval = reps === 0 ? 1 : reps === 1 ? Math.max(3, interval + 1) : Math.max(interval + 1, Math.round(interval * ease));
      reps++;
      break;
    case "easy":
      interval = reps === 0 ? 4 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
      ease += 0.15;
      reps++;
      break;
  }
  return { ease: Math.round(ease * 100) / 100, interval_days: Math.min(interval, 365), reps, lapses };
}

export function intervalLabel(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return "1 yr";
}

export function levelOf(card: Pick<CardRow, "due_day" | "interval_days">): CardLevel {
  if (!card.due_day) return "new";
  if (card.interval_days < 7) return "learning";
  if (card.interval_days < 21) return "known";
  return "mastered";
}

export const LEVEL_LABEL: Record<CardLevel, string> = {
  new: "New",
  learning: "Learning",
  known: "Familiar",
  mastered: "Mastered",
};

/** Lowercase, no accents or punctuation, no leading article. */
export function normalizeAnswer(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** "exact", "close" (a small typo — counted as right) or "wrong". */
export function checkTypedAnswer(input: string, answer: string): "exact" | "close" | "wrong" {
  const a = normalizeAnswer(input);
  const b = normalizeAnswer(answer);
  if (!a) return "wrong";
  if (a === b) return "exact";
  const allowed = b.length < 5 ? 0 : Math.floor(b.length / 6) + 1;
  return editDistance(a, b) <= Math.min(allowed, 3) ? "close" : "wrong";
}

export const XP = { card: 1, correct: 2, finish: 5, perfect: 5 };
export const DAILY_GOAL_XP = 30;
