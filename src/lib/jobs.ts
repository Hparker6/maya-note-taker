import "server-only";
import { generatePractice, generateSheet, transcribeDocument, type GenerationCallbacks } from "./ai";
import type { JobEvent, JobStatus, SheetScope } from "./types";

// AI work runs in the server process, independent of any request, so the student
// can upload a stack of PDFs and keep working while they are processed.

const MAX_CONCURRENT = 2;
const KEEP_FINISHED_MS = 60_000;

type Runner = (cb: GenerationCallbacks) => Promise<{ html: string; warning?: string; message?: string }>;

export interface Job {
  key: string;
  status: JobStatus;
  text: string;
  result?: Extract<JobEvent, { t: "done" } | { t: "error" }>;
  listeners: Set<(e: JobEvent) => void>;
}

interface JobRegistry {
  jobs: Map<string, Job>;
  active: number;
  queue: (() => void)[];
}

declare global {
  var __mayaJobs: JobRegistry | undefined;
}

const registry: JobRegistry = (globalThis.__mayaJobs ??= { jobs: new Map(), active: 0, queue: [] });

export const sheetKey = (scope: SheetScope, id: number) => `${scope}:${id}`;
export const transcriptKey = (documentId: number) => `transcript:${documentId}`;

function emit(job: Job, event: JobEvent) {
  for (const listener of job.listeners) listener(event);
}

async function acquireSlot() {
  if (registry.active < MAX_CONCURRENT) {
    registry.active++;
    return;
  }
  await new Promise<void>((resolve) => registry.queue.push(resolve));
}

function releaseSlot() {
  const next = registry.queue.shift();
  if (next) next();
  else registry.active--;
}

export function getTask(key: string): Job | undefined {
  return registry.jobs.get(key);
}

export function isTaskRunning(key: string) {
  const job = registry.jobs.get(key);
  return Boolean(job && !job.result);
}

/** Starts a task unless one with the same key is already running. */
export function startTask(key: string, run: Runner): Job {
  const existing = registry.jobs.get(key);
  if (existing && !existing.result) return existing;

  const job: Job = { key, status: "queued", text: "", listeners: new Set() };
  registry.jobs.set(key, job);

  void (async () => {
    await acquireSlot();
    try {
      const { html, warning, message } = await run({
        status: (s) => {
          if (job.status === s) return;
          job.status = s;
          emit(job, { t: "status", v: s });
        },
        delta: (v) => {
          job.text += v;
          emit(job, { t: "delta", v });
        },
      });
      job.result = { t: "done", html, warning, message };
    } catch (err) {
      job.result = { t: "error", message: err instanceof Error ? err.message : String(err) };
    } finally {
      releaseSlot();
      emit(job, job.result!);
      setTimeout(() => {
        if (registry.jobs.get(key) === job) registry.jobs.delete(key);
      }, KEEP_FINISHED_MS);
    }
  })();

  return job;
}

export const startSheetJob = (scope: SheetScope, id: number) => startTask(sheetKey(scope, id), (cb) => generateSheet(scope, id, cb));
export const startTranscriptJob = (documentId: number) =>
  startTask(transcriptKey(documentId), (cb) => transcribeDocument(documentId, cb));
export const isRunning = (scope: SheetScope, id: number) => isTaskRunning(sheetKey(scope, id));
export const practiceKey = (unitId: number) => `practice:${unitId}`;
export const startPracticeJob = (unitId: number) => startTask(practiceKey(unitId), (cb) => generatePractice(unitId, cb));

/** Replays the job's progress so far, then forwards live events until it ends. */
export function subscribe(job: Job, listener: (e: JobEvent) => void): () => void {
  listener({ t: "status", v: job.status });
  if (job.text) listener({ t: "delta", v: job.text });
  if (job.result) {
    listener(job.result);
    return () => {};
  }
  job.listeners.add(listener);
  return () => job.listeners.delete(listener);
}

/** NDJSON response that streams a job's events to the browser. */
export function jobStreamResponse(job: Job | undefined): Response {
  const encoder = new TextEncoder();
  const line = (e: JobEvent) => encoder.encode(JSON.stringify(e) + "\n");
  if (!job) return new Response(line({ t: "idle" }), { headers: { "Content-Type": "application/x-ndjson" } });

  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      unsubscribe = subscribe(job, (event) => {
        if (closed) return;
        try {
          controller.enqueue(line(event));
        } catch {
          closed = true;
        }
        if (event.t === "done" || event.t === "error") {
          closed = true;
          queueMicrotask(() => {
            unsubscribe();
            try {
              controller.close();
            } catch {}
          });
        }
      });
    },
    cancel() {
      // The client left; the job keeps going and saves on its own.
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
