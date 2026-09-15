"use client";

import { createContext, useContext } from "react";
import type { ClassNode, ClassRow } from "@/lib/types";

export interface ShellApi {
  tree: ClassNode[];
  aiReady: boolean;
  openUpload: (opts?: { unitId?: number; files?: File[] }) => void;
  openSearch: () => void;
  openClassDialog: (klass?: ClassRow) => void;
  setActiveUnit: (unitId: number | null) => void;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}
