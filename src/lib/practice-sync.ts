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
/** Keys this tab has already sent, so a copy left in storage by another tab isn't sent twice. */
const sent = new Set<string>();
let running = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const drainedWaiters = new Set<() => void>();

function stored(): Job[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((j) => typeof j?.url === "string" && typeof j?.body?.key === "string") : [];
  } catch {
    return [];
  }
}

function jobs(): Job[] {
  if (queue) return queue;
  queue = stored();
  const kick = () => void pump();
  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", kick);
  // Another tab may be queueing answers too; take on anything it left behind.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    adopt();
    void pump();
  });
  return queue;
}

/** Merges in anything another tab stored, keyed by the id each update carries (never one already sent). */
function adopt() {
  if (!queue) return;
  const known = new Set([...queue.map((j) => j.body.key), ...sent]);
  for (const job of stored()) if (!known.has(job.body.key)) queue.push(job);
}

function persist() {
  try {
    adopt();
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
      sent.add(job.body.key);
      if (sent.size > 500) sent.delete(sent.values().next().value!);
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
