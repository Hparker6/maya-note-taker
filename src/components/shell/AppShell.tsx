"use client";

import clsx from "clsx";
import { BookMarked, Menu as MenuIcon, UploadCloud } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";
import { resumePractice } from "@/lib/practice-sync";
import type { AiProvider, ClassNode, ClassRow } from "@/lib/types";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { StudySession, type StudyRequest } from "../practice/StudySession";
import { FeedbackProvider } from "../ui/feedback";
import { AiSettingsDialog } from "./AiSettingsDialog";
import { CanvasSettingsDialog } from "./CanvasSettingsDialog";
import { ShareDialog, type ShareTarget } from "./ShareDialog";
import { ClassDialog } from "./ClassDialog";
import { SearchPalette } from "./SearchPalette";
import { ShellContext, type CanvasSummary, type ShellApi } from "./ShellContext";
import { Sidebar } from "./Sidebar";
import { UploadDialog } from "./UploadDialog";

export function AppShell({
  tree,
  aiProvider,
  practiceDue,
  canvas,
  passwordEnabled,
  children,
}: {
  tree: ClassNode[];
  aiProvider: AiProvider | null;
  practiceDue: number;
  canvas: CanvasSummary;
  passwordEnabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const aiReady = aiProvider !== null;
  const [upload, setUpload] = useState<{ unitId?: number; files?: File[] } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [study, setStudy] = useState<{ request: StudyRequest; nonce: number } | null>(null);
  const [studyVersion, setStudyVersion] = useState(0);
  const [classDialog, setClassDialog] = useState<{ klass?: ClassRow } | null>(null);
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fileDrag, setFileDrag] = useState(false);
  const dragDepth = useRef(0);
  const activeUnitRef = useRef<number | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    activeUnitRef.current = activeUnit;
  }, [activeUnit]);

  // Close the mobile drawer whenever the route changes.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }

  const openUpload = useCallback((opts?: { unitId?: number; files?: File[] }) => setUpload(opts ?? {}), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openClassDialog = useCallback((klass?: ClassRow) => setClassDialog({ klass }), []);
  const openAiSettings = useCallback(() => setAiSettingsOpen(true), []);
  const openCanvas = useCallback(() => setCanvasOpen(true), []);
  const openShare = useCallback((target: ShareTarget) => setShareTarget(target), []);
  const startStudy = useCallback((request: StudyRequest) => setStudy({ request, nonce: Date.now() }), []);
  const endStudy = useCallback(() => {
    setStudy(null);
    setStudyVersion((v) => v + 1);
    router.refresh();
  }, [router]);

  const api = useMemo<ShellApi>(
    () => ({ tree, aiReady, aiProvider, openAiSettings, openCanvas, openShare, canvas, practiceDue, startStudy, studyVersion, openUpload, openSearch, openClassDialog, setActiveUnit }),
    [tree, aiReady, aiProvider, openAiSettings, openCanvas, openShare, canvas, practiceDue, startStudy, studyVersion, openUpload, openSearch, openClassDialog],
  );

  // Send flashcard reviews and quiz results left unsent by an earlier visit (e.g. closed while offline).
  useEffect(() => resumePractice(), []);

  // Tell the server the browser's time zone so "due today" and streaks follow the student's day.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.split("; ").includes(`tz=${encodeURIComponent(tz)}`)) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }
    } catch {}
  }, [router]);

  // Ctrl/⌘+K search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drop PDFs anywhere to upload them.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e) || document.querySelector("dialog[open]")) return;
      dragDepth.current++;
      setFileDrag(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setFileDrag(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    // Capture phase: always clear the overlay, even if a local drop zone stops propagation.
    const onDropCapture = () => {
      dragDepth.current = 0;
      setFileDrag(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (document.querySelector("dialog[open]")) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) {
        const routeUnit = window.location.pathname.match(/^\/units\/(\d+)/)?.[1];
        setUpload({ files, unitId: activeUnitRef.current ?? (routeUnit ? Number(routeUnit) : undefined) });
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("drop", onDropCapture, true);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("drop", onDropCapture, true);
    };
  }, []);

  const sidebar = <Sidebar activeUnitId={activeUnit} passwordEnabled={passwordEnabled} onNavigate={() => setDrawerOpen(false)} />;

  return (
    <FeedbackProvider>
      <ShellContext.Provider value={api}>
        <div className="flex h-dvh overflow-hidden">
          {isDesktop ? (
            <aside className="w-[272px] shrink-0 border-r border-line bg-sunken">{sidebar}</aside>
          ) : (
            <div className={clsx("fixed inset-0 z-40", drawerOpen ? "" : "pointer-events-none")}>
              <div
                className={clsx("absolute inset-0 bg-black/30 transition-opacity", drawerOpen ? "opacity-100" : "opacity-0")}
                onClick={() => setDrawerOpen(false)}
              />
              <aside
                className={clsx(
                  "absolute inset-y-0 left-0 w-[288px] max-w-[85vw] border-r border-line bg-sunken shadow-float transition-transform duration-200",
                  drawerOpen ? "translate-x-0" : "-translate-x-full",
                )}
              >
                {sidebar}
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className={clsx("flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper px-3", isDesktop && "hidden")}>
              <button
                onClick={() => setDrawerOpen(true)}
                className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-hover"
                aria-label="Open menu"
              >
                <MenuIcon className="size-5" />
              </button>
              <div className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink">
                <BookMarked className="size-4" />
              </div>
              <span className="font-serif text-base font-semibold">{APP_NAME}</span>
            </header>
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>

        {fileDrag && (
          <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-accent/10 p-6 backdrop-blur-[2px]">
            <div className="flex animate-pop flex-col items-center rounded-3xl border-2 border-dashed border-accent bg-card px-12 py-10 shadow-float">
              <UploadCloud className="mb-3 size-9 text-accent" />
              <p className="font-serif text-xl font-semibold">Drop PDFs to upload</p>
              <p className="mt-1 text-sm text-ink-3">You&apos;ll choose the class and unit next.</p>
            </div>
          </div>
        )}

        <UploadDialog
          open={Boolean(upload)}
          onClose={() => setUpload(null)}
          tree={tree}
          aiReady={aiReady}
          defaultUnitId={upload?.unitId}
          initialFiles={upload?.files}
        />
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} tree={tree} />
        <ClassDialog open={Boolean(classDialog)} klass={classDialog?.klass} onClose={() => setClassDialog(null)} />
        <AiSettingsDialog open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
        <CanvasSettingsDialog open={canvasOpen} onClose={() => setCanvasOpen(false)} tree={tree} />
        <ShareDialog key={shareTarget ? `${shareTarget.scope}:${shareTarget.id}` : "none"} target={shareTarget} onClose={() => setShareTarget(null)} />
        {study && (
          <StudySession
            key={study.nonce}
            request={study.request}
            onClose={endStudy}
            onRestart={(request) => {
              setStudyVersion((v) => v + 1);
              setStudy({ request, nonce: Date.now() });
            }}
          />
        )}
      </ShellContext.Provider>
    </FeedbackProvider>
  );
}

/** Lets a page (e.g. a PDF view) tell the sidebar which unit to highlight. */
export function ActiveUnit({ id }: { id: number }) {
  const setActiveUnit = useContext(ShellContext)?.setActiveUnit;
  useEffect(() => {
    setActiveUnit?.(id);
    return () => setActiveUnit?.(null);
  }, [setActiveUnit, id]);
  return null;
}
