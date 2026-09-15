"use client";

import clsx from "clsx";
import DOMPurify from "dompurify";
import {
  AlertTriangle,
  Check,
  Copy,
  FilePenLine,
  MoreHorizontal,
  PenLine,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, countWords, estimatePages } from "@/lib/client";
import { markdownToHtml } from "@/lib/markdown";
import type { JobEvent, JobStatus, SheetRow, SheetScope, SheetState } from "@/lib/types";
import { useAutosave } from "@/lib/useAutosave";
import { RichEditor } from "./editor/RichEditor";
import { RelativeTime } from "./RelativeTime";
import { SaveIndicator } from "./SaveIndicator";
import { Button, buttonClass } from "./ui/Button";
import { useFeedback } from "./ui/feedback";
import { Menu } from "./ui/Menu";

type LocalSheet = Pick<SheetRow, "content" | "generated_at" | "updated_at">;

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Waiting for another sheet to finish…",
  reading: "Reading your material…",
  thinking: "Thinking through what matters most…",
  writing: "Writing your sheet…",
};

export function SheetPanel({
  scope,
  scopeId,
  initial,
  aiReady,
  blockedReason,
  emptyTitle,
  emptyBody,
  sourceSummary,
  compact = false,
}: {
  scope: SheetScope;
  scopeId: number;
  initial: SheetState;
  aiReady: boolean;
  blockedReason?: string;
  emptyTitle: string;
  emptyBody: string;
  sourceSummary?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [sheet, setSheet] = useState<LocalSheet | null>(initial.sheet);
  const [stale, setStale] = useState(initial.stale);
  const [editing, setEditing] = useState(false);
  const [gen, setGen] = useState<{ status: JobStatus; html: string; startedAt: number } | null>(() =>
    initial.running ? { status: "queued", html: "", startedAt: Date.now() } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Adopt fresh server data (e.g. after router.refresh()) unless the user is mid-edit.
  const serverKey = `${initial.sheet?.updated_at ?? ""}|${initial.stale}`;
  const [seenServerKey, setSeenServerKey] = useState(serverKey);
  if (serverKey !== seenServerKey && !editing && !gen) {
    setSeenServerKey(serverKey);
    setSheet(initial.sheet);
    setStale(initial.stale);
  }

  const saver = useAutosave(async (html: string) => {
    const res = await api<{ updated_at: string }>(`/api/sheets/${scope}/${scopeId}`, { method: "PUT", json: { content: html } });
    setSheet((s) => ({ content: html, generated_at: s?.generated_at ?? res.updated_at, updated_at: res.updated_at }));
  });

  const consume = useCallback(
    async (start: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let markdown = "";
      let lastRender = 0;
      try {
        const res = await fetch(`/api/sheets/${scope}/${scopeId}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Couldn't start generating.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as JobEvent;
            if (event.t === "idle") {
              setGen(null);
            } else if (event.t === "status") {
              setGen((g) => ({ status: event.v, html: g?.html ?? "", startedAt: g?.startedAt ?? Date.now() }));
            } else if (event.t === "delta") {
              markdown += event.v;
              const t = performance.now();
              if (t - lastRender > 80) {
                lastRender = t;
                const html = DOMPurify.sanitize(markdownToHtml(markdown));
                setGen((g) => (g ? { ...g, status: "writing", html } : g));
              }
            } else if (event.t === "done") {
              const ts = new Date().toISOString();
              setSheet({ content: event.html, generated_at: ts, updated_at: ts });
              setStale(false);
              setGen(null);
              if (event.warning) toast(event.warning, "info");
              else if (start) toast("Study sheet ready");
              router.refresh();
            } else if (event.t === "error") {
              setGen(null);
              setError(event.message);
            }
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setGen(null);
        setError(err instanceof Error ? err.message : "Lost connection while generating.");
      }
    },
    [scope, scopeId, router, toast],
  );

  // Reattach to a generation that's already running (e.g. auto-condense after upload).
  // consume() subscribes to a server stream; its state updates all happen after awaits.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial.running) void consume(false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Depends only on the start time: `gen` itself changes with every streamed chunk.
  const startedAt = gen?.startedAt;
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const generate = async () => {
    if (sheet && sheet.updated_at !== sheet.generated_at) {
      const ok = await confirm({
        title: "Replace your edits?",
        message: "You've edited this sheet. Regenerating writes a fresh one from the sources and replaces your changes.",
        confirmLabel: "Regenerate",
        danger: true,
      });
      if (!ok) return;
    }
    await saver.flush();
    setEditing(false);
    setError(null);
    setElapsed(0);
    setGen({ status: "queued", html: "", startedAt: Date.now() });
    void consume(true);
  };

  const finishEditing = async () => {
    await saver.flush();
    setEditing(false);
    router.refresh();
  };

  const copy = async () => {
    if (!sheet) return;
    const div = document.createElement("div");
    div.innerHTML = sheet.content;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([sheet.content], { type: "text/html" }),
          "text/plain": new Blob([div.innerText], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(div.innerText);
    }
    toast("Copied — paste into Docs, Word, or Notion");
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this sheet?",
      message: "The sheet is removed. Your PDFs and notes stay untouched, and you can generate it again anytime.",
      confirmLabel: "Delete sheet",
      danger: true,
    });
    if (!ok) return;
    await api(`/api/sheets/${scope}/${scopeId}`, { method: "DELETE" });
    setSheet(null);
    setEditing(false);
    router.refresh();
  };

  const startBlank = () => {
    const ts = new Date().toISOString();
    setSheet({ content: "", generated_at: ts, updated_at: ts });
    setEditing(true);
  };

  const words = sheet ? countWords(sheet.content) : 0;
  const edited = sheet && sheet.updated_at !== sheet.generated_at;
  const pad = compact ? "px-5" : "px-6 sm:px-10";

  // ── generating ──
  if (gen) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={clsx("flex items-center gap-3 border-b border-line py-3", pad)}>
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
          </span>
          <span className="shimmer-text text-sm font-medium">{STATUS_LABEL[gen.status]}</span>
          <span className="ml-auto text-xs text-ink-3 tabular-nums">{elapsed}s</span>
        </div>
        <div className={clsx("flex-1 overflow-y-auto py-6", pad)}>
          {gen.html ? (
            <div className="rich rich-sheet mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: gen.html }} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              {[92, 78, 85, 60, 88, 70, 45].map((w, i) => (
                <div key={i} className="h-3.5 animate-pulse rounded bg-sunken" style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }} />
              ))}
              <p className="pt-3 text-center text-xs text-ink-3">
                Claude reads every page before writing — long PDFs can take a minute or two. You can leave this page; it keeps going.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── empty ──
  if (!sheet) {
    return (
      <div className={clsx("flex flex-1 flex-col items-center justify-center py-14 text-center", pad)}>
        <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Sparkles className="size-6" />
        </div>
        <h3 className="font-serif text-2xl font-semibold tracking-tight">{emptyTitle}</h3>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-3">{emptyBody}</p>
        {sourceSummary && <p className="mt-3 text-xs font-medium tracking-wide text-ink-3 uppercase">{sourceSummary}</p>}
        {error && <ErrorNote message={error} className="mt-5" />}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" size="lg" onClick={generate} disabled={!aiReady || Boolean(blockedReason)}>
            <Sparkles /> {error ? "Try again" : "Generate with Claude"}
          </Button>
          <Button variant="ghost" size="lg" onClick={startBlank}>
            <PenLine /> Write it myself
          </Button>
        </div>
        {!aiReady && (
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-3">
            AI is off. Add <code className="rounded bg-sunken px-1 py-0.5">ANTHROPIC_API_KEY</code> to{" "}
            <code className="rounded bg-sunken px-1 py-0.5">.env.local</code> and restart the app.
          </p>
        )}
        {aiReady && blockedReason && <p className="mt-4 text-xs text-ink-3">{blockedReason}</p>}
      </div>
    );
  }

  // ── editing ──
  if (editing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={clsx("flex items-center gap-3 border-b border-line py-2.5", pad)}>
          <FilePenLine className="size-4 text-ink-3" />
          <span className="text-sm font-medium">Editing sheet</span>
          <SaveIndicator status={saver.status} onRetry={() => void saver.flush()} />
          <Button variant="primary" size="sm" className="ml-auto" onClick={finishEditing}>
            <Check /> Done
          </Button>
        </div>
        <RichEditor
          content={sheet.content}
          variant="sheet"
          autofocus
          placeholder="Write your study sheet…"
          onUpdate={(html) => saver.schedule(html)}
          className="min-h-0 flex-1"
          toolbarClassName={clsx("sticky top-0 z-10", compact ? "px-3" : "px-4 sm:px-8")}
          contentClassName={clsx("overflow-y-auto py-6", pad)}
        />
      </div>
    );
  }

  // ── ready ──
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5", pad)}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span className="font-medium text-ink-2">
            ~{estimatePages(words)} page{estimatePages(words) > 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>{words.toLocaleString()} words</span>
          <span>·</span>
          <RelativeTime iso={sheet.updated_at} prefix={edited ? "Edited " : "Generated "} />
          {stale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--tc-orange)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tc-orange)]">
              <AlertTriangle className="size-3" /> Sources changed
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {aiReady && !blockedReason && (
            <Button size="sm" variant={stale ? "primary" : "ghost"} onClick={generate}>
              <RefreshCw /> {stale ? "Update" : "Regenerate"}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            <PenLine /> Edit
          </Button>
          <a href={`/print/${scope}/${scopeId}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            <Printer /> <span className="hidden sm:inline">Print / PDF</span>
          </a>
          <Menu
            triggerClassName={buttonClass("ghost", "icon-sm")}
            trigger={<MoreHorizontal />}
            items={[
              { label: "Copy formatted text", icon: <Copy />, onSelect: copy },
              { label: "Delete sheet", icon: <Trash2 />, onSelect: remove, danger: true, separatorBefore: true },
            ]}
          />
        </div>
      </div>
      {error && <ErrorNote message={error} className={clsx("mt-4", compact ? "mx-5" : "mx-6 sm:mx-10")} />}
      <div className={clsx("flex-1 overflow-y-auto py-6", pad)}>
        <article
          className="rich rich-sheet mx-auto max-w-3xl"
          onDoubleClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: sheet.content || "<p><em>This sheet is empty.</em></p>" }}
        />
      </div>
    </div>
  );
}

function ErrorNote({ message, className }: { message: string; className?: string }) {
  return (
    <div className={clsx("flex max-w-lg items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-left text-sm text-ink", className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <span>{message}</span>
    </div>
  );
}
