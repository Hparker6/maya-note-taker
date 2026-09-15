"use client";

import type { JobEvent, JobStatus } from "./types";

export interface JobHandlers {
  status?: (status: JobStatus) => void;
  /** Called with the full text streamed so far. */
  text?: (markdown: string) => void;
  done?: (event: Extract<JobEvent, { t: "done" }>) => void;
  error?: (message: string) => void;
  idle?: () => void;
}

/** Reads a server job's NDJSON event stream until it finishes. */
export async function consumeJobStream(url: string, start: boolean, on: JobHandlers, signal?: AbortSignal) {
  let markdown = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start }),
      signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Couldn't start.");
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
        if (event.t === "idle") on.idle?.();
        else if (event.t === "status") on.status?.(event.v);
        else if (event.t === "delta") {
          markdown += event.v;
          on.text?.(markdown);
        } else if (event.t === "done") on.done?.(event);
        else if (event.t === "error") on.error?.(event.message);
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    on.error?.(err instanceof Error ? err.message : "Lost connection.");
  }
}
