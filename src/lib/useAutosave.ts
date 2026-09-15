"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isRetryable } from "./client";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced saving that never runs two saves at once. A failed save is kept and retried with backoff
 * (and when the connection or window comes back); leaving the page or hiding the tab saves right away.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<{ message: string; blocked: boolean } | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const saveRef = useRef(save);
  const retry = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    const item = pending.current;
    if (!item) return;
    clearTimeout(retryTimer.current);
    pending.current = null;
    setStatus("saving");
    inFlight.current = saveRef
      .current(item.value)
      .then(() => {
        attempt.current = 0;
        setError(null);
        if (!pending.current) setStatus("saved");
      })
      .catch((err: unknown) => {
        // Keep the value unless something newer was scheduled meanwhile.
        pending.current ??= item;
        const blocked = !isRetryable(err);
        setError({ message: err instanceof ApiError ? err.message : "Can't reach the notebook right now", blocked });
        setStatus("error");
        if (!blocked) {
          retryTimer.current = setTimeout(() => void retry.current(), Math.min(30_000, 1_500 * 2 ** attempt.current++));
        }
      })
      .finally(() => {
        inFlight.current = null;
      });
    await inFlight.current;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus((s) => (s === "error" ? s : "pending"));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    retry.current = flush;
    const kick = () => {
      if (pending.current) void flush();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") kick();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", kick);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", kick);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(retryTimer.current);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, status, error };
}
