import "server-only";
import { generateSheet } from "./ai";
import type { JobEvent, JobStatus, SheetScope } from "./types";

// Generation runs in the server process, independent of any request, so the
// student can upload a stack of PDFs and keep working while they condense.

const MAX_CONCURRENT = 2;
const KEEP_FINISHED_MS = 60_000;

interface Job {
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

const keyOf = (scope: SheetScope, id: number) => `${scope}:${id}`;

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

export function isRunning(scope: SheetScope, id: number) {
  const job = registry.jobs.get(keyOf(scope, id));
  return Boolean(job && !job.result);
}

export function runningKeys(): string[] {
  return [...registry.jobs.values()].filter((j) => !j.result).map((j) => j.key);
}

/** Starts generation unless it's already running. */
export function startJob(scope: SheetScope, id: number): Job {
  const key = keyOf(scope, id);
  const existing = registry.jobs.get(key);
  if (existing && !existing.result) return existing;

  const job: Job = { key, status: "queued", text: "", listeners: new Set() };
  registry.jobs.set(key, job);

  void (async () => {
    await acquireSlot();
    try {
      const { html, warning } = await generateSheet(scope, id, {
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
      job.result = { t: "done", html, warning };
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

export function getJob(scope: SheetScope, id: number): Job | undefined {
  return registry.jobs.get(keyOf(scope, id));
}

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
