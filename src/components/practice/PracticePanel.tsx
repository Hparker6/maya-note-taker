"use client";

import clsx from "clsx";
import {
  Brain,
  Hand,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  ScanText,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { consumeJobStream } from "@/lib/job-client";
import { LEVEL_LABEL, levelOf } from "@/lib/practice-shared";
import type { CardRow, JobStatus, UnitPracticeData } from "@/lib/types";
import { useShell } from "../shell/ShellContext";
import { Button, buttonClass, inputClass, Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";
import { Menu } from "../ui/Menu";
import { LEVEL_COLORS, MasteryBar } from "./MasteryBar";

const GEN_LABEL: Record<JobStatus, string> = {
  queued: "Waiting for other AI work…",
  reading: "Reading your lectures and notes…",
  thinking: "Picking what's most testable…",
  writing: "Writing cards and questions…",
  retrying: "Free AI is busy — retrying…",
};

const PAGE = 60;

export function PracticePanel({
  unitId,
  unitName,
  initial,
  hasMaterial,
}: {
  unitId: number;
  unitName: string;
  initial: UnitPracticeData;
  hasMaterial: boolean;
}) {
  const { aiReady, aiProvider, openAiSettings, startStudy, studyVersion } = useShell();
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(initial);
  const [finding, setFinding] = useState(false);
  const [gen, setGen] = useState<{ status: JobStatus } | null>(initial.generating ? { status: "queued" } : null);
  const [editing, setEditing] = useState<{ card?: CardRow } | null>(null);
  const [listTab, setListTab] = useState<"cards" | "questions">("cards");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const abort = useRef<AbortController | null>(null);

  const refresh = async () => {
    try {
      setData(await api<UnitPracticeData>(`/api/units/${unitId}/practice`));
    } catch {}
  };

  // Load the current deck on mount (the page may come from the back/forward cache) and after each study session.
  useEffect(() => {
    void api<UnitPracticeData>(`/api/units/${unitId}/practice`)
      .then(setData)
      .catch(() => {});
  }, [studyVersion, unitId]);

  const attach = (start: boolean) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    void consumeJobStream(
      `/api/units/${unitId}/practice/generate`,
      start,
      {
        status: (status) => setGen({ status }),
        done: (e) => {
          setGen(null);
          toast(e.message ?? "Practice set ready");
          if (e.warning) toast(e.warning, "info");
          void refresh();
        },
        error: (message) => {
          setGen(null);
          toast(message, "error");
        },
        idle: () => setGen(null),
      },
      controller.signal,
    );
  };

  // Reattach if generation was already running when the page loaded.
  useEffect(() => {
    if (initial.generating) attach(false);
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findCards = async () => {
    setFinding(true);
    try {
      const result = await api<UnitPracticeData & { found: number; added: number }>(`/api/units/${unitId}/practice`, { method: "POST" });
      setData(result);
      if (result.added) toast(`Added ${result.added} flashcard${result.added === 1 ? "" : "s"} from your notes`);
      else if (result.found) toast("No new cards — everything in your notes is already in the deck", "info");
      else toast("No cards found. Bold a term (Term: definition) or highlight a key phrase in your notes, then try again.", "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't make cards", "error");
    } finally {
      setFinding(false);
    }
  };

  const deleteCard = async (card: CardRow) => {
    const ok = await confirm({ title: "Delete this card?", message: card.front, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`/api/cards/${card.id}`, { method: "DELETE" });
    } catch (err) {
      toast(err instanceof Error ? `Couldn't delete: ${err.message}` : "Couldn't delete", "error");
    }
    void refresh();
  };

  const resetCard = async (card: CardRow) => {
    const ok = await confirm({
      title: "Reset this card's progress?",
      message: "Its review history is cleared and it comes back as a new card.",
      confirmLabel: "Reset progress",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/cards/${card.id}`, { method: "PATCH", json: { reset: true } });
      toast("Progress reset — it'll show up as a new card");
    } catch (err) {
      toast(err instanceof Error ? `Couldn't reset: ${err.message}` : "Couldn't reset", "error");
    }
    void refresh();
  };

  const deleteQuestion = async (id: number) => {
    const ok = await confirm({ title: "Delete this question?", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`/api/questions/${id}`, { method: "DELETE" });
    } catch (err) {
      toast(err instanceof Error ? `Couldn't delete: ${err.message}` : "Couldn't delete", "error");
    }
    void refresh();
  };

  const { stats, cards, questions } = data;
  const toReview = stats.due + Math.min(stats.new, 10);
  const canQuiz = stats.total >= 4 || questions.length > 0;
  const empty = stats.total === 0 && questions.length === 0;

  const q = query.trim().toLowerCase();
  const filteredCards = q ? cards.filter((c) => `${c.front} ${c.back}`.toLowerCase().includes(q)) : cards;
  const filteredQuestions = q ? questions.filter((x) => `${x.prompt} ${x.choices.join(" ")}`.toLowerCase().includes(q)) : questions;

  const modes = [
    {
      id: "review" as const,
      title: "Flashcards",
      icon: Layers,
      color: "var(--success)",
      subtitle: toReview ? `${stats.due ? `${stats.due} due` : ""}${stats.due && stats.new ? " · " : ""}${stats.new ? `${stats.new} new` : ""}` : "All caught up for today",
      badge: toReview || null,
      disabled: stats.total === 0,
      onClick: () => startStudy({ mode: toReview ? "review" : "cram", unitId }),
    },
    {
      id: "quiz" as const,
      title: "Quiz",
      icon: ListChecks,
      color: "var(--tc-blue)",
      subtitle: canQuiz ? "10 quick questions" : "Needs 4+ flashcards",
      badge: null,
      disabled: !canQuiz,
      onClick: () => startStudy({ mode: "quiz", unitId }),
    },
    {
      id: "cram" as const,
      title: "Cram",
      icon: Zap,
      color: "var(--tc-purple)",
      subtitle: stats.total ? `Flip through all ${stats.total}` : "No cards yet",
      badge: null,
      disabled: stats.total === 0,
      onClick: () => startStudy({ mode: "cram", unitId }),
    },
  ];

  const builders = (
    <section className={clsx(!empty && "mt-10")}>
      {!empty && <h2 className="mb-3 font-serif text-lg font-semibold tracking-tight">Add to your deck</h2>}
      <div className="grid gap-3 md:grid-cols-3">
        <BuilderCard
          icon={ScanText}
          title="From my notes"
          tag="Free · instant"
          body={
            <>
              Finds <strong className="font-semibold text-ink-2">bold terms</strong>, &ldquo;Term: definition&rdquo; lines,{" "}
              <mark className="rounded bg-[var(--hl-yellow)] px-0.5 text-ink-2">highlights</mark>, tables and short lists.
            </>
          }
          action={
            <Button onClick={findCards} disabled={finding || !hasMaterial} className="w-full">
              {finding ? <Spinner className="size-3.5" /> : <Wand2 />} Find cards
            </Button>
          }
        />
        <BuilderCard
          icon={Sparkles}
          title="With AI"
          tag={aiProvider === "gemini" ? "Gemini · free" : aiProvider === "claude" ? "Claude" : "Free with Gemini"}
          body="Writes flashcards and multiple-choice questions from your lectures and notes."
          action={
            gen ? (
              <div className="flex h-9 items-center gap-2 rounded-lg bg-accent-soft px-3 text-[13px] font-medium text-accent">
                <Spinner className="size-3.5" />
                <span className="shimmer-text truncate">{GEN_LABEL[gen.status]}</span>
              </div>
            ) : aiReady ? (
              <Button variant="primary" onClick={() => {
                  setGen({ status: "queued" });
                  attach(true);
                }} disabled={!hasMaterial} className="w-full">
                <Sparkles /> Generate
              </Button>
            ) : (
              <Button variant="primary" onClick={openAiSettings} className="w-full">
                <Sparkles /> Set up free AI
              </Button>
            )
          }
        />
        <BuilderCard
          icon={Pencil}
          title="Write your own"
          tag="Manual"
          body={
            <>
              Add a card by hand. Type <code className="rounded bg-sunken px-1">___</code> in the front for a fill-in-the-blank.
            </>
          }
          action={
            <Button onClick={() => setEditing({})} className="w-full">
              <Plus /> New card
            </Button>
          }
        />
      </div>
      {!hasMaterial && <p className="mt-3 text-xs text-ink-3">Import a PDF or write a note in this unit to make cards from it.</p>}
    </section>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
        {empty ? (
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 grid size-16 place-items-center rounded-3xl bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success">
              <Brain className="size-8" />
            </div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight">Practice what you&apos;ve learned</h2>
            <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-ink-3">
              Flashcards use spaced repetition: cards you struggle with come back sooner, and ones you know space out. Quizzes mix in
              multiple choice and typed answers. A few minutes a day beats cramming.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {modes.map((m) => (
                <button
                  key={m.id}
                  onClick={m.onClick}
                  disabled={m.disabled}
                  className="chunky group relative flex items-center gap-4 rounded-2xl border-line bg-card px-4 py-4 text-left hover:bg-hover disabled:cursor-not-allowed disabled:opacity-55 sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-5"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white dark:text-[#10100e]" style={{ background: m.color }}>
                    <m.icon className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-bold">{m.title}</span>
                    <span className="block truncate text-[13px] text-ink-3">{m.subtitle}</span>
                  </span>
                  {m.badge && (
                    <span className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-xs font-bold text-white tabular-nums dark:text-[#10100e]" style={{ background: "var(--tc-orange)" }}>
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-line bg-paper/50 px-5 py-4">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">Deck strength</span>
                <span className="text-xs text-ink-3">
                  {stats.total} card{stats.total === 1 ? "" : "s"} · {questions.length} quiz question{questions.length === 1 ? "" : "s"}
                </span>
              </div>
              <MasteryBar stats={stats} legend />
            </div>
          </>
        )}

        {builders}

        {!empty && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center gap-3">
              <div role="tablist" className="flex gap-1 rounded-xl bg-sunken p-1">
                {(
                  [
                    ["cards", `Flashcards`, cards.length],
                    ["questions", `Quiz questions`, questions.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={listTab === id}
                    onClick={() => setListTab(id)}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                      listTab === id ? "bg-card text-ink shadow-[var(--shadow-sm)]" : "text-ink-3 hover:text-ink",
                    )}
                  >
                    {label} <span className="text-[11px] text-ink-3 tabular-nums">{count}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards" className={clsx(inputClass, "h-9 pl-9")} aria-label="Search cards" />
              </label>
            </div>

            {listTab === "cards" ? (
              filteredCards.length ? (
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {filteredCards.slice(0, limit).map((card) => {
                    const level = levelOf(card);
                    return (
                      <li key={card.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-hover/50">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: LEVEL_COLORS[level] }} title={LEVEL_LABEL[level]} />
                        <div className="grid min-w-0 flex-1 gap-x-6 gap-y-0.5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                          <div className="text-[14px] font-medium break-words">{card.front}</div>
                          <div className="line-clamp-3 text-[13.5px] whitespace-pre-line text-ink-2">{card.back}</div>
                        </div>
                        <span className="mt-0.5 hidden shrink-0 text-ink-3 sm:block" title={card.source === "ai" ? "Written by AI" : card.source === "notes" ? `From ${card.origin || "your notes"}` : "Written by you"}>
                          {card.source === "ai" ? <Sparkles className="size-3.5" /> : card.source === "notes" ? <ScanText className="size-3.5" /> : <Hand className="size-3.5" />}
                        </span>
                        <Menu
                          triggerClassName={clsx(buttonClass("ghost", "icon-sm"), "row-menu -my-1 opacity-0 group-hover:opacity-100 aria-expanded:opacity-100")}
                          trigger={<MoreHorizontal />}
                          items={[
                            { label: "Edit card", icon: <Pencil />, onSelect: () => setEditing({ card }) },
                            { label: "Reset progress", icon: <RotateCcw />, onSelect: () => resetCard(card), disabled: !card.due_day },
                            { label: "Delete card", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => deleteCard(card) },
                          ]}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyList text={q ? "No cards match your search." : "No flashcards yet."} />
              )
            ) : filteredQuestions.length ? (
              <ul className="mt-4 space-y-3">
                {filteredQuestions.slice(0, limit).map((question) => (
                  <li key={question.id} className="group rounded-2xl border border-line bg-card px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 text-[14px] font-medium">{question.prompt}</p>
                      {question.times_seen > 0 && (
                        <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                          {question.times_correct}/{question.times_seen} right
                        </span>
                      )}
                      <button
                        onClick={() => deleteQuestion(question.id)}
                        className="row-menu -my-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-danger"
                        aria-label="Delete question"
                        title="Delete question"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <ol className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
                      {question.choices.map((choice, i) => (
                        <li key={i} className={clsx("rounded-lg px-2.5 py-1", i === question.answer ? "bg-success-soft font-medium text-ink" : "text-ink-3")}>
                          {choice}
                        </li>
                      ))}
                    </ol>
                    {question.explanation && <p className="mt-2 text-xs text-ink-3">{question.explanation}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyList text={q ? "No questions match your search." : "Quiz questions come from “With AI”. Quizzes also use your flashcards."} />
            )}

            {(listTab === "cards" ? filteredCards.length : filteredQuestions.length) > limit && (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE * 4)}>
                  Show more
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      <CardDialog
        open={Boolean(editing)}
        card={editing?.card}
        unitId={unitId}
        unitName={unitName}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />
    </div>
  );
}

function BuilderCard({
  icon: Icon,
  title,
  tag,
  body,
  action,
}: {
  icon: typeof Brain;
  title: string;
  tag: string;
  body: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon className="size-4" />
        </span>
        <span className="font-semibold">{title}</span>
        <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 text-[10.5px] font-medium text-ink-3">{tag}</span>
      </div>
      <p className="mt-2.5 mb-4 flex-1 text-[13px] leading-relaxed text-ink-3">{body}</p>
      {action}
    </div>
  );
}

function EmptyList({ text }: { text: string }) {
  return <p className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3">{text}</p>;
}

function CardDialog({
  open,
  card,
  unitId,
  unitName,
  onClose,
  onSaved,
}: {
  open: boolean;
  card?: CardRow;
  unitId: number;
  unitName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useFeedback();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saving, setSaving] = useState(false);
  const [addAnother, setAddAnother] = useState(false);

  // Load the card being edited each time the dialog opens.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const openKey = open ? `${card?.id ?? "new"}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (open) {
      setFront(card?.front ?? "");
      setBack(card?.back ?? "");
    }
  }

  const save = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    try {
      if (card) await api(`/api/cards/${card.id}`, { method: "PATCH", json: { front, back } });
      else await api("/api/cards", { method: "POST", json: { unit_id: unitId, front, back } });
      if (!card && addAnother) {
        toast("Card added");
        setFront("");
        setBack("");
        document.getElementById("card-front")?.focus();
      } else {
        toast(card ? "Card updated" : "Card added");
        onSaved();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={card ? "Edit flashcard" : "New flashcard"}
      description={card ? undefined : `Adds to ${unitName}.`}
      footer={
        <>
          {!card && (
            <label className="mr-auto flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} /> Add another
            </label>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || !front.trim() || !back.trim()}>
            {saving && <Spinner className="size-3.5" />} {card ? "Save" : "Add card"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Front</span>
          <textarea
            id="card-front"
            autoFocus
            rows={2}
            maxLength={300}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="A term, a question, or a sentence with ___ for the blank"
            className={clsx(inputClass, "h-auto resize-y py-2 leading-relaxed")}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Back</span>
          <textarea
            rows={3}
            maxLength={700}
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="The answer"
            className={clsx(inputClass, "h-auto resize-y py-2 leading-relaxed")}
          />
        </label>
        <p className="text-xs text-ink-3">Tip: keep one fact per card. Ctrl/⌘ + Enter saves.</p>
      </form>
    </Dialog>
  );
}
