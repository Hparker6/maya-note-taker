"use client";

import clsx from "clsx";
import { ChevronLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "@/lib/brand";
import { useHydrated, useLocalStorage } from "@/lib/useStorage";
import { Button, buttonClass } from "../ui/Button";

const PREFS_KEY = "print:prefs";
const SIZES = { S: 0.9, M: 1, L: 1.12 } as const;
type Size = keyof typeof SIZES;

export function PrintView({
  title,
  context,
  backHref,
  html,
  updatedAt,
}: {
  title: string;
  context: string;
  backHref: string;
  html: string;
  updatedAt: string;
}) {
  const [storedPrefs, setStoredPrefs] = useLocalStorage(PREFS_KEY);
  const prefs = useMemo(() => {
    try {
      const p = JSON.parse(storedPrefs ?? "{}");
      return { cols: ([1, 2, 3].includes(p.cols) ? p.cols : 2) as 1 | 2 | 3, size: (p.size in SIZES ? p.size : "M") as Size };
    } catch {
      return { cols: 2 as const, size: "M" as Size };
    }
  }, [storedPrefs]);
  const { cols, size } = prefs;
  const setCols = (c: 1 | 2 | 3) => setStoredPrefs(JSON.stringify({ ...prefs, cols: c }));
  const setSize = (s: Size) => setStoredPrefs(JSON.stringify({ ...prefs, size: s }));

  const hydrated = useHydrated();
  const date = hydrated ? new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const [pages, setPages] = useState<number | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  // Estimate printed pages from the rendered height of the letter-width preview.
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => setPages(Math.max(1, Math.ceil((el.scrollHeight / 96 - 0.9) / 10.1))));
    return () => cancelAnimationFrame(id);
  }, [cols, size, html]);

  return (
    <div className="min-h-dvh bg-sunken print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[8.5in] flex-wrap items-center gap-3 px-4 py-2.5">
          <Link href={backHref} className={buttonClass("ghost", "sm")}>
            <ChevronLeft /> Back
          </Link>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-0.5 text-[13px]">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                onClick={() => setCols(n)}
                className={clsx("rounded-md px-2.5 py-1", cols === n ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink")}
              >
                {n} col{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-0.5 text-[13px]">
            {(Object.keys(SIZES) as Size[]).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={clsx("rounded-md px-2.5 py-1", size === s ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink")}
                title={s === "S" ? "Smaller text" : s === "M" ? "Default text" : "Larger text"}
              >
                {s}
              </button>
            ))}
          </div>
          {pages && (
            <span className="text-xs text-ink-3">
              ≈ {pages} page{pages > 1 ? "s" : ""}
            </span>
          )}
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="px-4 py-8 print:p-0">
        <div
          ref={paperRef}
          className="mx-auto w-full max-w-[8.5in] bg-white px-[0.45in] py-[0.45in] text-[#111] shadow-float print:max-w-none print:p-0 print:shadow-none"
        >
          <header className="mb-2 flex items-baseline justify-between gap-4 border-b border-[#ddd8cc] pb-1.5" style={{ fontSize: `${10 * SIZES[size]}pt` }}>
            <div className="min-w-0">
              <span className="font-serif text-[1.35em] font-semibold tracking-tight">{title}</span>
              <span className="ml-2 text-[0.8em] text-[#666]">{context}</span>
            </div>
            <span className="shrink-0 text-[0.75em] text-[#888]">
              {date} · {APP_NAME}
            </span>
          </header>
          <div
            className={clsx("rich sheet-print", cols === 2 && "cols-2", cols === 3 && "cols-3")}
            style={{ zoom: SIZES[size] }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
