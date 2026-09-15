"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/** Debounced saving that never runs two saves at once and flushes on unmount. */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 700) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef<{ value: T } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const item = pending.current;
    if (!item) return;
    pending.current = null;
    setStatus("saving");
    inFlight.current = saveRef
      .current(item.value)
      .then(() => {
        if (!pending.current) setStatus("saved");
      })
      .catch(() => {
        pending.current ??= item;
        setStatus("error");
      })
      .finally(() => {
        inFlight.current = null;
      });
    await inFlight.current;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  return { schedule, flush, status };
}
