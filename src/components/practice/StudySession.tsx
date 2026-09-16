"use client";

import clsx from "clsx";
import { Check, Flame, Keyboard, Layers, ListChecks, PartyPopper, RotateCcw, Timer, Trophy, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, randomKey } from "@/lib/client";
import { checkTypedAnswer, intervalLabel, schedule, XP, type Rating } from "@/lib/practice-shared";
import { sendPractice, waitForPractice } from "@/lib/practice-sync";
import type { CardRow, SessionItem, StreakInfo, StudyMode, StudySession as Session } from "@/lib/types";
import { Spinner } from "../ui/Button";
import { useFeedback } from "../ui/feedback";

export interface StudyRequest {
  mode: StudyMode;
  unitId?: number;
  classId?: number;
}

type QueueItem = SessionItem & { attempt: number; uid: string };

const PRAISE = ["Nice!", "Correct!", "You got it!", "Great job!", "Exactly!", "Well done!"];
const MODE_LABEL: Record<StudyMode, string> = { review: "Flashcards", cram: "Cram", quiz: "Quiz", weak: "Weak spots" };

export function sessionUrl(req: StudyRequest) {
  const params = new URLSearchParams({ mode: req.mode });
  if (req.unitId) params.set("unit", String(req.unitId));
  if (req.classId) params.set("class", String(req.classId));
  return `/api/practice/session?${params}`;
}

/** Full-screen practice: flashcards with spaced repetition, cram, or a quick quiz. */
export function StudySession({
  request,
  onClose,
  onRestart,
}: {
  request: StudyRequest;
  onClose: () => void;
  onRestart: (request: StudyRequest) => void;
}) {
  const { toast } = useFeedback();
  const [session, setSession] = useState<Session | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tally, setTally] = useState({ answered: 0, correct: 0 });
  const [finished, setFinished] = useState<null | { streak: StreakInfo | null; seconds: number; bonus: number }>(null);

  const startedAt = useRef(0);
  const missedCards = useRef(new Set<number>());
  const questionResults = useRef(new Map<number, boolean>());
  const logged = useRef(false);
  // The item already answered, so a double tap or a held key can't record it twice.
  const answered = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Session>(sessionUrl(request))
      .then((s) => {
        if (cancelled) return;
        startedAt.current = Date.now();
        setSession(s);
        setQueue(s.items.map((item) => ({ ...item, attempt: 0, uid: item.key })));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Couldn't start practice."));
    return () => {
      cancelled = true;
    };
  }, [request]);

  /**
   * Records the session once. If the connection drops, the result is queued and retried (with the
   * same key, so it still counts once); the streak just isn't shown this time.
   */
  const log = useCallback(
    async (stats: { items: number; correct: number; xp: number }) => {
      if (logged.current || !session) return null;
      logged.current = true;
      const body = {
        key: randomKey(),
        mode: session.mode,
        unit_id: session.unitId,
        items: stats.items,
        correct: stats.correct,
        xp: stats.xp,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
        missed_card_ids: [...missedCards.current],
        question_results: [...questionResults.current].map(([id, correct]) => ({ id, correct })),
      };
      // Reviews answered just before the end go first, so the streak reflects them.
      await waitForPractice(2500);
      try {
        return await api<StreakInfo>("/api/practice/log", { method: "POST", json: body });
      } catch {
        sendPractice("/api/practice/log", body, body.key);
        return null;
      }
    },
    [session],
  );

  const close = useCallback(async () => {
    // Anything answered counts, even a quiz with no right answers yet: misses bring cards back for review.
    const progress = xp > 0 || doneKeys.size > 0 || tally.answered > 0 || missedCards.current.size > 0 || questionResults.current.size > 0;
    if (!finished && progress) await log({ items: doneKeys.size, correct: tally.correct, xp });
    if (!(await waitForPractice(2500))) toast("Some answers are still saving — they'll finish when the connection is back.", "info");
    onClose();
  }, [finished, xp, doneKeys, tally, log, onClose, toast]);

  // Esc leaves the session (progress is kept).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const finish = async (nextDone: Set<string>, nextXp: number, nextTally: typeof tally) => {
    if (!session || logged.current) return;
    const perfect = session.mode === "quiz" && nextTally.answered >= 5 && nextTally.correct === nextTally.answered;
    const bonus = XP.finish + (perfect ? XP.perfect : 0);
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    // State from this render is one step behind, so pass the final numbers explicitly.
    const streak = await log({ items: nextDone.size, correct: nextTally.correct, xp: nextXp + bonus });
    setFinished({ streak, seconds, bonus });
  };

  const advance = (nextQueue: QueueItem[], nextDone: Set<string>, nextXp: number, nextTally: typeof tally) => {
    setQueue(nextQueue);
    setDoneKeys(nextDone);
    setXp(nextXp);
    setTally(nextTally);
    if (pos + 1 >= nextQueue.length) void finish(nextDone, nextXp, nextTally);
    else setPos(pos + 1);
  };

  const requeue = (item: QueueItem, at: number, patch: Partial<QueueItem> = {}) => {
    const copy = { ...item, ...patch, attempt: item.attempt + 1, uid: `${item.key}#${item.attempt + 1}` } as QueueItem;
    const next = [...queue];
    next.splice(Math.min(at, next.length), 0, copy);
    return next;
  };

  const current = queue[pos];

  const onRate = (rating: Rating) => {
    if (!current || current.type !== "card" || answered.current === current.uid) return;
    answered.current = current.uid;
    const card = current.card;
    sendPractice(`/api/cards/${card.id}/review`, { rating });
    const nextDone = new Set(doneKeys);
    let nextQueue = queue;
    if (rating === "again") nextQueue = requeue(current, pos + 4, { card: { ...card, ...schedule(card, "again"), due_day: card.due_day || "today" } });
    else nextDone.add(current.key);
    advance(nextQueue, nextDone, xp + XP.card, tally);
  };

  const onCram = (knewIt: boolean) => {
    if (!current || current.type !== "card" || answered.current === current.uid) return;
    answered.current = current.uid;
    const nextDone = new Set(doneKeys);
    let nextQueue = queue;
    if (!knewIt && current.attempt < 3) nextQueue = requeue(current, queue.length);
    else nextDone.add(current.key);
    advance(nextQueue, nextDone, xp + (knewIt ? XP.card : 0), tally);
  };

  const onAnswer = (correct: boolean) => {
    if (!current || current.type === "card" || answered.current === current.uid) return;
    answered.current = current.uid;
    const first = current.attempt === 0;
    const nextTally = first ? { answered: tally.answered + 1, correct: tally.correct + (correct ? 1 : 0) } : tally;
    if (first && current.type === "mcq" && current.questionId) questionResults.current.set(current.questionId, correct);
    if (first && !correct && current.cardId) missedCards.current.add(current.cardId);
    setCombo(correct ? combo + 1 : 0);

    const nextDone = new Set(doneKeys);
    let nextQueue = queue;
    // Missed questions come back at the end (twice at most), like a lesson that won't let you skip mistakes.
    if (!correct && current.attempt < 2) nextQueue = requeue(current, queue.length);
    else nextDone.add(current.key);
    advance(nextQueue, nextDone, xp + (correct ? (first ? XP.correct : 1) : 0), nextTally);
  };

  const total = session?.items.length ?? 0;
  const progress = finished ? 1 : total ? doneKeys.size / total : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${MODE_LABEL[request.mode]} practice`}
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-paper pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* header */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pt-4 sm:gap-4 sm:px-6 sm:pt-6">
        <button
          onClick={() => void close()}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          aria-label="Close practice"
          title="Close (Esc)"
        >
          <X className="size-6" />
        </button>
        <div
          className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken ring-1 ring-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="relative h-full rounded-full bg-success transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(progress * 100, progress ? 4 : 0)}%` }}
          >
            <div className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/30" />
          </div>
        </div>
        {combo >= 3 && !finished && (
          <span key={combo} className="flex animate-bounce-in items-center gap-1 text-sm font-bold text-[var(--tc-orange)]" title={`${combo} in a row`}>
            <Flame className="size-5 fill-current" /> {combo}
          </span>
        )}
        <span className="flex items-center gap-1 text-sm font-bold text-[var(--tc-blue)] tabular-nums" title="XP this session">
          <Zap className="size-4 fill-current" /> {xp + (finished?.bonus ?? 0)}
        </span>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <Centered>
            <p className="text-ink-2">{loadError}</p>
            <button onClick={onClose} className={bigButton("secondary")}>
              Close
            </button>
          </Centered>
        ) : !session ? (
          <Centered>
            <Spinner className="size-6 text-accent" />
          </Centered>
        ) : finished ? (
          <FinishScreen
            session={session}
            xp={xp + finished.bonus}
            tally={tally}
            seconds={finished.seconds}
            streak={finished.streak}
            reviewed={doneKeys.size}
            onDone={onClose}
            onAgain={() => onRestart(request)}
          />
        ) : !queue.length ? (
          <EmptySession mode={session.mode} onSwitch={(mode) => onRestart({ ...request, mode })} onClose={onClose} />
        ) : current ? (
          <ItemView key={current.uid} item={current} mode={session.mode} onRate={onRate} onCram={onCram} onAnswer={onAnswer} />
        ) : null}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 py-12 text-center">{children}</div>;
}

const bigButton = (variant: "primary" | "secondary" | "success" | "danger") =>
  clsx(
    "chunky inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-bold tracking-wide uppercase disabled:opacity-50",
    variant === "primary" && "border-[color-mix(in_oklab,var(--accent)_70%,black)] bg-accent text-accent-ink hover:bg-accent-hover",
    variant === "success" && "border-[color-mix(in_oklab,var(--success)_70%,black)] bg-success text-white dark:text-[#0e1a15]",
    variant === "danger" && "border-[color-mix(in_oklab,var(--danger)_70%,black)] bg-danger text-white dark:text-[#1a0f0c]",
    variant === "secondary" && "border-line-strong bg-card text-ink-2 hover:bg-hover",
  );

// ───────────────────────────── items ─────────────────────────────

function ItemView({
  item,
  mode,
  onRate,
  onCram,
  onAnswer,
}: {
  item: QueueItem;
  mode: StudyMode;
  onRate: (r: Rating) => void;
  onCram: (knewIt: boolean) => void;
  onAnswer: (correct: boolean) => void;
}) {
  if (item.type === "card") return <CardView item={item} mode={mode} onRate={onRate} onCram={onCram} />;
  if (item.type === "mcq") return <ChoiceView item={item} onAnswer={onAnswer} />;
  return <TypedView item={item} onAnswer={onAnswer} />;
}

/** Renders "_____" in a cloze as a blank line, or fills it with the answer. */
function Cloze({ text, fill }: { text: string; fill?: string }) {
  const parts = text.split(/_{3,}/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 &&
            (fill ? (
              <mark className="rounded bg-[var(--hl-yellow)] px-1 text-ink">{fill}</mark>
            ) : (
              <span className="mx-1 inline-block w-20 translate-y-1 border-b-[3px] border-accent" aria-label="blank" />
            ))}
        </span>
      ))}
    </>
  );
}

function CardBack({ card }: { card: CardRow }) {
  if (card.kind === "list")
    return (
      <ul className="mx-auto max-w-md space-y-1.5 text-left text-lg">
        {card.back.split("\n").map((line, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
            {line}
          </li>
        ))}
      </ul>
    );
  if (card.kind === "cloze") return <p className="text-xl leading-relaxed"><Cloze text={card.front} fill={card.back} /></p>;
  return <p className="text-xl leading-relaxed whitespace-pre-line">{card.back}</p>;
}

function CardView({ item, mode, onRate, onCram }: { item: Extract<QueueItem, { type: "card" }>; mode: StudyMode; onRate: (r: Rating) => void; onCram: (k: boolean) => void }) {
  const [flipped, setFlipped] = useState(false);
  const card = item.card;
  const cram = mode === "cram";
  const label = card.kind === "cloze" ? "Fill in the blank" : card.kind === "list" ? `Name all ${card.back.split("\n").length}` : "Do you remember?";

  const ratings: { rating: Rating; label: string; tone: string }[] = [
    { rating: "again", label: "Again", tone: "border-[color-mix(in_oklab,var(--danger)_45%,var(--line))] text-danger" },
    { rating: "hard", label: "Hard", tone: "border-[color-mix(in_oklab,var(--tc-orange)_45%,var(--line))] text-[var(--tc-orange)]" },
    { rating: "good", label: "Good", tone: "border-[color-mix(in_oklab,var(--success)_45%,var(--line))] text-success" },
    { rating: "easy", label: "Easy", tone: "border-[color-mix(in_oklab,var(--tc-blue)_45%,var(--line))] text-[var(--tc-blue)]" },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && cram && (e.key === "1" || e.key === "2")) {
        onCram(e.key === "2");
      } else if (flipped && cram && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        onCram(true);
      } else if (flipped && !cram && ["1", "2", "3", "4"].includes(e.key)) {
        onRate(ratings[Number(e.key) - 1].rating);
      } else if (flipped && !cram && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        onRate("good");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 pt-6 pb-4 sm:px-6 sm:pt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink sm:text-xl">{label}</h2>
        {card.reps === 0 && !card.due_day && <span className="rounded-full bg-[color-mix(in_oklab,var(--tc-purple)_15%,transparent)] px-2.5 py-0.5 text-xs font-bold text-[var(--tc-purple)] uppercase">New card</span>}
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flip w-full animate-pop text-left focus:outline-none"
        data-flipped={flipped}
        aria-label={flipped ? "Show the question" : "Reveal the answer"}
      >
        <div className="flip-inner">
          <div className="flip-face flex min-h-[280px] flex-col rounded-3xl border-2 border-b-[6px] border-line bg-card px-6 py-8 shadow-soft sm:min-h-[320px] sm:px-10">
            <div className="flex flex-1 items-center justify-center text-center">
              <p className={clsx("font-serif leading-snug font-semibold text-balance", card.front.length > 120 ? "text-xl" : "text-2xl sm:text-3xl")}>
                {card.kind === "cloze" ? <Cloze text={card.front} /> : card.front}
              </p>
            </div>
            <p className="mt-6 text-center text-xs font-medium text-ink-3">Tap or press Space to flip</p>
          </div>
          <div className="flip-face flip-back flex min-h-[280px] flex-col rounded-3xl border-2 border-b-[6px] border-accent/40 bg-card px-6 py-8 shadow-soft sm:min-h-[320px] sm:px-10">
            {card.kind !== "cloze" && <p className="text-center text-sm font-semibold text-ink-3">{card.front}</p>}
            <div className={clsx("flex flex-1 items-center justify-center text-center", card.kind !== "cloze" && "mt-4 border-t border-line pt-5")}>
              <CardBack card={card} />
            </div>
          </div>
        </div>
      </button>
      {item.context && <p className="mt-3 truncate text-center text-xs text-ink-3">{item.context}</p>}

      <div className="mt-auto pt-8">
        {!flipped ? (
          <div className="flex justify-center">
            <button onClick={() => setFlipped(true)} className={clsx(bigButton("primary"), "w-full sm:w-72")} autoFocus>
              Show answer
            </button>
          </div>
        ) : cram ? (
          <div className="grid animate-slide-up grid-cols-2 gap-3">
            <button onClick={() => onCram(false)} className={clsx(bigButton("secondary"), "w-full normal-case")}>
              <RotateCcw className="size-4" /> Still learning
            </button>
            <button onClick={() => onCram(true)} className={clsx(bigButton("success"), "w-full normal-case")} autoFocus>
              <Check className="size-5" /> Know it
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-center text-sm font-semibold text-ink-2">How well did you remember it?</p>
            <div className="grid animate-slide-up grid-cols-2 gap-2.5 sm:grid-cols-4">
              {ratings.map((r, i) => {
                const next = schedule(card, r.rating);
                return (
                  <button key={r.rating} onClick={() => onRate(r.rating)} className={clsx("chunky flex flex-col items-center rounded-2xl bg-card px-3 py-2.5 hover:bg-hover", r.tone)}>
                    <span className="text-[15px] font-bold">{r.label}</span>
                    <span className="text-[11.5px] font-medium text-ink-3">
                      {r.rating === "again" ? "see again soon" : intervalLabel(next.interval_days)}
                      <kbd className="ml-1.5 hidden rounded border border-line px-1 text-[10px] [@media(hover:hover)]:inline">{i + 1}</kbd>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FeedbackBar({
  state,
  correctAnswer,
  explanation,
  closeNote,
  onContinue,
}: {
  state: "correct" | "wrong";
  correctAnswer?: string;
  explanation?: string;
  closeNote?: string;
  onContinue: () => void;
}) {
  const praise = PRAISE[((correctAnswer?.length ?? 0) + (explanation?.length ?? 0)) % PRAISE.length];
  const ok = state === "correct";
  return (
    <div className={clsx("animate-slide-up border-t-2", ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft")}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={clsx("grid size-11 shrink-0 animate-bounce-in place-items-center rounded-full bg-card", ok ? "text-success" : "text-danger")}>
            {ok ? <Check className="size-6 stroke-[3]" /> : <X className="size-6 stroke-[3]" />}
          </span>
          <div className="min-w-0" role="status">
            <p className={clsx("text-xl font-bold", ok ? "text-success" : "text-danger")}>{ok ? praise : "Not quite"}</p>
            {closeNote && <p className="mt-0.5 text-sm text-ink-2">{closeNote}</p>}
            {!ok && correctAnswer && (
              <p className="mt-0.5 text-sm text-ink-2">
                <span className="font-semibold text-danger">Correct answer:</span> {correctAnswer}
              </p>
            )}
            {explanation && <p className="mt-1 text-sm text-ink-2">{explanation}</p>}
          </div>
        </div>
        <button onClick={onContinue} className={clsx(bigButton(ok ? "success" : "danger"), "w-full sm:w-auto")} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}

function QuestionShell({ label, context, children, footer }: { label: string; context: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-6 sm:px-6 sm:pt-10">
        <h2 className="text-lg font-bold sm:text-xl">{label}</h2>
        {context && <p className="mt-0.5 truncate text-xs text-ink-3">{context}</p>}
        <div className="mt-5 animate-pop">{children}</div>
      </div>
      <div className="sticky bottom-0">{footer}</div>
    </div>
  );
}

function ChoiceView({ item, onAnswer }: { item: Extract<QueueItem, { type: "mcq" }>; onAnswer: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = selected === item.answer;
  const isCloze = /_{3,}/.test(item.prompt);

  const check = () => {
    if (selected === null) return;
    setChecked(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!checked && n >= 1 && n <= item.choices.length) setSelected(n - 1);
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (checked) onAnswer(correct);
        else check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <QuestionShell
      label={item.label}
      context={item.context}
      footer={
        checked ? (
          <FeedbackBar state={correct ? "correct" : "wrong"} correctAnswer={item.choices[item.answer]} explanation={item.explanation} onContinue={() => onAnswer(correct)} />
        ) : (
          <div className="border-t-2 border-line bg-paper">
            <div className="mx-auto flex w-full max-w-2xl justify-end px-4 py-5 sm:px-6">
              <button onClick={check} disabled={selected === null} className={clsx(bigButton("success"), "w-full sm:w-auto")}>
                Check
              </button>
            </div>
          </div>
        )
      }
    >
      <p className={clsx("leading-relaxed font-medium whitespace-pre-line", item.prompt.length > 160 ? "text-lg" : "text-xl sm:text-2xl")}>
        {isCloze ? <Cloze text={item.prompt} /> : item.prompt}
      </p>
      <div className="mt-6 grid gap-2.5" role="radiogroup">
        {item.choices.map((choice, i) => {
          const isSel = selected === i;
          const showRight = checked && i === item.answer;
          const showWrong = checked && isSel && !correct;
          return (
            <button
              key={i}
              role="radio"
              aria-checked={isSel}
              disabled={checked}
              onClick={() => setSelected(i)}
              className={clsx(
                "chunky flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] leading-snug disabled:cursor-default",
                showRight
                  ? "border-success bg-success-soft text-ink"
                  : showWrong
                    ? "animate-shake border-danger bg-danger-soft text-ink"
                    : isSel
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line bg-card text-ink hover:bg-hover",
                checked && !showRight && !showWrong && "opacity-60",
              )}
            >
              <span
                className={clsx(
                  "grid size-7 shrink-0 place-items-center rounded-lg border-2 text-xs font-bold",
                  showRight ? "border-success text-success" : showWrong ? "border-danger text-danger" : isSel ? "border-accent text-accent" : "border-line text-ink-3",
                )}
              >
                {showRight ? <Check className="size-4 stroke-[3]" /> : showWrong ? <X className="size-4 stroke-[3]" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">{choice}</span>
            </button>
          );
        })}
      </div>
    </QuestionShell>
  );
}

function TypedView({ item, onAnswer }: { item: Extract<QueueItem, { type: "typed" }>; onAnswer: (correct: boolean) => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<null | "exact" | "close" | "wrong">(null);
  const correct = result === "exact" || result === "close";
  const isCloze = /_{3,}/.test(item.prompt);

  const check = (giveUp = false) => {
    if (result) return;
    setResult(giveUp ? "wrong" : checkTypedAnswer(value, item.answer));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (result) onAnswer(correct);
      else if (value.trim()) check();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <QuestionShell
      label={item.label}
      context={item.context}
      footer={
        result ? (
          <FeedbackBar
            state={correct ? "correct" : "wrong"}
            correctAnswer={item.answer}
            closeNote={result === "close" ? `Close enough — watch the spelling: ${item.answer}` : undefined}
            onContinue={() => onAnswer(correct)}
          />
        ) : (
          <div className="border-t-2 border-line bg-paper">
            <div className="mx-auto flex w-full max-w-2xl flex-col-reverse gap-3 px-4 py-5 sm:flex-row sm:justify-between sm:px-6">
              <button onClick={() => check(true)} className={clsx(bigButton("secondary"), "w-full sm:w-auto")}>
                I don&apos;t know
              </button>
              <button onClick={() => check()} disabled={!value.trim()} className={clsx(bigButton("success"), "w-full sm:w-auto")}>
                Check
              </button>
            </div>
          </div>
        )
      }
    >
      <p className={clsx("leading-relaxed font-medium whitespace-pre-line", item.prompt.length > 160 ? "text-lg" : "text-xl sm:text-2xl")}>
        {isCloze ? <Cloze text={item.prompt} /> : item.prompt}
      </p>
      <input
        autoFocus
        value={value}
        disabled={Boolean(result)}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type your answer"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Your answer"
        className={clsx(
          "mt-6 h-14 w-full rounded-2xl border-2 bg-card px-4 text-lg text-ink placeholder:text-ink-3 focus:outline-none",
          result === null ? "border-line focus:border-accent" : correct ? "border-success" : "animate-shake border-danger",
        )}
      />
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
        <Keyboard className="size-3.5" /> Press Enter to check
      </p>
    </QuestionShell>
  );
}

// ───────────────────────────── end states ─────────────────────────────

function Confetti() {
  const colors = ["var(--tc-green)", "var(--tc-blue)", "var(--tc-orange)", "var(--tc-purple)", "var(--tc-red)", "var(--accent)"];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 70 }, (_, i) => {
        // Deterministic scatter keeps render pure.
        const r = (n: number) => Math.abs(Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: `${r(1) * 100}%`,
                background: colors[i % colors.length],
                "--drift": `${(r(2) - 0.5) * 30}vw`,
                "--spin": `${(r(3) - 0.5) * 1440}deg`,
                "--dur": `${2.2 + r(4) * 1.8}s`,
                "--delay": `${r(5) * 0.5}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function FinishScreen({
  session,
  xp,
  tally,
  seconds,
  streak,
  reviewed,
  onDone,
  onAgain,
}: {
  session: Session;
  xp: number;
  tally: { answered: number; correct: number };
  seconds: number;
  streak: StreakInfo | null;
  reviewed: number;
  onDone: () => void;
  onAgain: () => void;
}) {
  const quiz = session.mode === "quiz";
  const accuracy = tally.answered ? Math.round((tally.correct / tally.answered) * 100) : null;
  const perfect = quiz && accuracy === 100;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const goalPct = streak ? Math.min(100, Math.round((streak.xpToday / streak.goal) * 100)) : 0;

  const tiles = [
    { label: "Total XP", value: `+${xp}`, icon: Zap, color: "var(--tc-blue)" },
    quiz
      ? { label: accuracy !== null && accuracy >= 80 ? "Amazing" : "Accuracy", value: `${accuracy ?? 0}%`, icon: ListChecks, color: "var(--success)" }
      : { label: "Cards", value: String(reviewed), icon: Layers, color: "var(--success)" },
    { label: "Time", value: time, icon: Timer, color: "var(--tc-purple)" },
  ];

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <Confetti />
      <div className="grid size-24 animate-bounce-in place-items-center rounded-full bg-[color-mix(in_oklab,var(--tc-orange)_16%,transparent)] text-[var(--tc-orange)]">
        {perfect ? <Trophy className="size-12" /> : <PartyPopper className="size-12" />}
      </div>
      <h2 className="mt-6 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        {perfect ? "Perfect quiz!" : quiz ? "Quiz complete!" : "Session complete!"}
      </h2>
      <p className="mt-2 text-ink-3">{session.title}</p>

      <div className="mt-8 grid w-full max-w-md grid-cols-3 gap-3">
        {tiles.map(({ label, value, icon: Icon, color }, i) => (
          <div key={label} className="animate-bounce-in overflow-hidden rounded-2xl border-2" style={{ borderColor: color, animationDelay: `${150 + i * 120}ms` }}>
            <div className="py-1 text-[11px] font-bold tracking-wide text-white uppercase dark:text-[#111]" style={{ background: color }}>
              {label}
            </div>
            <div className="flex items-center justify-center gap-1.5 bg-card py-3 text-xl font-bold tabular-nums" style={{ color }}>
              <Icon className="size-4" /> {value}
            </div>
          </div>
        ))}
      </div>

      {streak && (
        <div className="mt-6 w-full max-w-md rounded-2xl border border-line bg-card px-5 py-4 text-left shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-3">
            <Flame className={clsx("size-8", streak.streak ? "fill-current text-[var(--tc-orange)]" : "text-ink-3")} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">
                {streak.streak} day streak{streak.streak > 1 ? "!" : ""}
              </div>
              <div className="text-xs text-ink-3">
                {streak.xpToday >= streak.goal ? "Daily goal reached — nice work." : `${streak.goal - streak.xpToday} XP to today's goal`}
              </div>
            </div>
            <span className="text-sm font-semibold text-ink-2 tabular-nums">
              {Math.min(streak.xpToday, 999)}/{streak.goal}
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-[var(--tc-orange)] transition-[width] duration-700" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-8 flex w-full max-w-md flex-col-reverse gap-3 sm:flex-row">
        <button onClick={onAgain} className={clsx(bigButton("secondary"), "flex-1")}>
          {session.mode === "review"
            ? session.remaining > 0
              ? `Keep going (${session.remaining})`
              : "Review more"
            : session.mode === "weak"
              ? session.remaining > 0
                ? `Keep drilling (${session.remaining})`
                : "Drill again"
              : quiz
                ? "New quiz"
                : "Cram again"}
        </button>
        <button onClick={onDone} className={clsx(bigButton("primary"), "flex-1")} autoFocus>
          Continue
        </button>
      </div>
    </div>
  );
}

function EmptySession({ mode, onSwitch, onClose }: { mode: StudyMode; onSwitch: (mode: StudyMode) => void; onClose: () => void }) {
  return (
    <Centered>
      <div className="grid size-20 place-items-center rounded-full bg-success-soft text-success">
        <Check className="size-10 stroke-[3]" />
      </div>
      <div>
        <h2 className="font-serif text-2xl font-semibold">
          {mode === "review" ? "All caught up!" : mode === "weak" ? "No weak spots right now" : "Nothing to practice yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-3">
          {mode === "review"
            ? "No flashcards are due right now. Come back tomorrow, or keep the momentum going below."
            : mode === "weak"
              ? "Nothing has tripped you up yet. Cards you forget, and quiz questions you miss, show up here to drill."
              : mode === "quiz"
                ? "A quiz needs at least 4 flashcards (or AI quiz questions) to choose answers from."
                : "Make some flashcards from your notes first."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {mode === "review" && (
          <>
            <button onClick={() => onSwitch("quiz")} className={bigButton("primary")}>
              Take a quiz
            </button>
            <button onClick={() => onSwitch("cram")} className={bigButton("secondary")}>
              Cram all cards
            </button>
          </>
        )}
        {mode !== "review" && (
          <button onClick={onClose} className={bigButton("primary")}>
            Got it
          </button>
        )}
      </div>
    </Centered>
  );
}
