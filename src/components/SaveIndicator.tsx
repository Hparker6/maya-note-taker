"use client";

import { AlertCircle, Check } from "lucide-react";
import type { SaveStatus } from "@/lib/useAutosave";
import { Spinner } from "./ui/Button";

export function SaveIndicator({
  status,
  onRetry,
  error,
  blocked = false,
}: {
  status: SaveStatus;
  onRetry?: () => void;
  /** Why saving failed. */
  error?: string | null;
  /** Retrying automatically won't help, so say what's wrong instead of "retrying". */
  blocked?: boolean;
}) {
  if (status === "idle") return null;
  if (status === "error")
    return (
      <button
        onClick={onRetry}
        title={error ? `${error} — click to try again now` : "Click to try again now"}
        className="flex items-center gap-1.5 text-left text-xs font-medium text-danger hover:underline"
        role="alert"
      >
        <AlertCircle className="size-3.5 shrink-0" />
        {blocked && error ? `Couldn't save: ${error}` : "Couldn't save yet — retrying"}
      </button>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-3" aria-live="polite">
      {status === "saved" ? <Check className="size-3.5 text-accent" /> : <Spinner className="size-3" />}
      {status === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}
