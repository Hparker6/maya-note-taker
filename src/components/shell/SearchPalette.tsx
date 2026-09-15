"use client";

import clsx from "clsx";
import { BookOpen, FileText, Folder, Layers, NotebookPen, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import type { ClassNode, SearchHit } from "@/lib/types";

const MARK_START = "";
const MARK_END = "";

interface Row {
  key: string;
  icon: ReactNode;
  title: string;
  context: string;
  snippet?: string;
  href: string;
}

function Snippet({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${MARK_START}[^${MARK_END}]*${MARK_END})`));
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith(MARK_START) ? (
          <mark key={i} className="rounded-sm bg-[var(--mark)] px-0.5 text-ink">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const KIND_ICON: Record<SearchHit["kind"], ReactNode> = {
  document: <FileText className="text-danger/80" />,
  note: <NotebookPen className="text-accent" />,
  sheet: <Sparkles className="text-[var(--tc-purple)]" />,
};

export function SearchPalette({ open, onClose, tree }: { open: boolean; onClose: () => void; tree: ClassNode[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === dialogRef.current && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100vw-2rem)] max-w-xl rounded-2xl border border-line bg-card p-0 text-ink shadow-float open:animate-pop"
    >
      {/* Mounted only while open, so every search starts fresh. */}
      {open && <PaletteBody tree={tree} onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ tree, onClose }: { tree: ClassNode[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] }>({ query: "", hits: [] });
  const [active, setActive] = useState(0);
  const query = q.trim();

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        setResult({ query, hits: res.hits });
        setActive(0);
      } catch {
        /* aborted or offline */
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const places = useMemo<Row[]>(() => {
    const needle = query.toLowerCase();
    if (!needle) return [];
    const rows: Row[] = [];
    for (const c of tree) {
      const cName = c.code ? `${c.code} · ${c.name}` : c.name;
      if (cName.toLowerCase().includes(needle))
        rows.push({ key: `c${c.id}`, icon: <BookOpen />, title: cName, context: "Class", href: `/classes/${c.id}` });
      for (const s of c.sections) {
        if (s.name.toLowerCase().includes(needle))
          rows.push({ key: `s${s.id}`, icon: <Layers />, title: s.name, context: c.name, href: `/sections/${s.id}` });
        for (const u of s.units)
          if (u.name.toLowerCase().includes(needle))
            rows.push({ key: `u${u.id}`, icon: <Folder />, title: u.name, context: `${c.name} › ${s.name}`, href: `/units/${u.id}` });
      }
    }
    return rows.slice(0, 6);
  }, [query, tree]);

  const hits = query && result.query === query ? result.hits : [];
  const searching = Boolean(query) && result.query !== query;
  const rows: Row[] = [
    ...places,
    ...hits.map((h, i) => ({ key: `h${i}`, icon: KIND_ICON[h.kind], title: h.title, context: h.context, snippet: h.snippet, href: h.href })),
  ];

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    router.push(row.href);
  };

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-[18px] text-ink-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(rows[active]);
            }
          }}
          placeholder="Search PDFs, notes, sheets, classes…"
          className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-ink-3 focus:outline-none"
        />
        <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-3">Esc</kbd>
      </div>
      <div className="max-h-[55vh] overflow-y-auto p-2">
        {!query && <p className="px-3 py-8 text-center text-sm text-ink-3">Search across every PDF, note and study sheet you have.</p>}
        {query && !rows.length && (
          <p className="px-3 py-8 text-center text-sm text-ink-3">{searching ? "Searching…" : `Nothing matches “${query}”.`}</p>
        )}
        {rows.map((row, i) => (
          <button
            key={row.key}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(row)}
            className={clsx(
              "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors [&_svg]:size-4",
              i === active && "bg-hover",
            )}
          >
            <span className="mt-0.5 shrink-0 text-ink-3">{row.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{row.title}</span>
                <span className="truncate text-xs text-ink-3">{row.context}</span>
              </span>
              {row.snippet && (
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-3">
                  <Snippet text={row.snippet} />
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
