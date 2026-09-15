"use client";

// Flashcard reviews and study-session results, sent in order and kept (also in localStorage) until the
// server confirms them. Each carries a key, so a retry after a lost response is only counted once.

import { api, isRetryable, randomKey } from "./client";

interface Job {
  url: string;
  body: Record<string, unknown> & { key: string };
}

const STORAGE_KEY = "maya:unsent-practice";

let queue: Job[] | null = null;
let running = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const drainedWaiters = new Set<() => void>();

function jobs(): Job[] {
  if (queue) return queue;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    queue = Array.isArray(stored) ? stored.filter((j) => typeof j?.url === "string" && typeof j?.body?.key === "string") : [];
  } catch {
    queue = [];
  }
  const kick = () => void pump();
  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", kick);
  return queue;
}

function persist() {
  try {
    if (queue?.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

async function pump() {
  const list = jobs();
  if (running) return;
  running = true;
  clearTimeout(retryTimer);
  try {
    while (list.length) {
      const job = list[0];
      try {
        await api(job.url, { method: "POST", json: job.body });
      } catch (err) {
        if (isRetryable(err)) {
          retryTimer = setTimeout(() => void pump(), Math.min(30_000, 1_500 * 2 ** attempt++));
          return;
        }
        // Rejected for good (e.g. the card was deleted): nothing to retry.
        console.warn("[practice] dropped an update the server rejected:", err);
      }
      list.shift();
      attempt = 0;
      persist();
    }
    for (const resolve of drainedWaiters) resolve();
    drainedWaiters.clear();
  } finally {
    running = false;
  }
}

/** Queues a practice update; returns its key. */
export function sendPractice(url: string, body: Record<string, unknown>, key = randomKey()) {
  jobs().push({ url, body: { ...body, key } });
  persist();
  void pump();
  return key;
}

/** Sends anything left over from an earlier visit (e.g. the window closed while offline). */
export function resumePractice() {
  if (jobs().length) void pump();
}

/** Resolves true once everything is sent, or false if it's still retrying after `timeoutMs`. */
export function waitForPractice(timeoutMs: number): Promise<boolean> {
  if (!jobs().length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      drainedWaiters.delete(done);
      resolve(false);
    }, timeoutMs);
    drainedWaiters.add(done);
    void pump();
  });
}
