"use client";

import { AlertCircle, Check } from "lucide-react";
import type { SaveStatus } from "@/lib/useAutosave";
import { Spinner } from "./ui/Button";

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  if (status === "idle") return null;
  if (status === "error")
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 text-xs font-medium text-danger hover:underline">
        <AlertCircle className="size-3.5" /> Couldn&apos;t save — retry
      </button>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-3" aria-live="polite">
      {status === "saved" ? <Check className="size-3.5 text-accent" /> : <Spinner className="size-3" />}
      {status === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}
