"use client";

import { createContext, useContext } from "react";
import type { AiProvider, ClassNode, ClassRow, StudyMode } from "@/lib/types";

export interface ShellApi {
  tree: ClassNode[];
  aiReady: boolean;
  aiProvider: AiProvider | null;
  openAiSettings: () => void;
  openCanvas: () => void;
  openShare: (target: { scope: "class" | "unit" | "note"; id: number; title: string }) => void;
  canvas: CanvasSummary;
  /** Cards due (or new) across all classes. */
  practiceDue: number;
  startStudy: (request: { mode: StudyMode; unitId?: number; classId?: number }) => void;
  /** Bumps whenever a study session closes, so practice views can refetch. */
  studyVersion: number;
  openUpload: (opts?: { unitId?: number; files?: File[] }) => void;
  openSearch: () => void;
  openClassDialog: (klass?: ClassRow) => void;
  setActiveUnit: (unitId: number | null) => void;
}

export interface CanvasSummary {
  connected: boolean;
  /** Grades need the API token; the calendar feed alone has none. */
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}
