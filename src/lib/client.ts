// Browser-side helpers.

/** A request the server answered with an error. Network failures throw a plain TypeError instead. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Worth trying again later: the network or server hiccuped, rather than the request being wrong. */
export const isRetryable = (err: unknown) => !(err instanceof ApiError) || err.status >= 500 || [408, 425, 429].includes(err.status);

export async function api<T = unknown>(
  url: string,
  init: { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.json || init.form ? "POST" : "GET"),
    headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    signal: init.signal,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    // Session expired: a full reload to the login page is intentional here (unsaved notes are kept as drafts).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${res.status})`, res.status, data);
  return data as T;
}

/** A short random id (works on plain http, e.g. an iPad on the same Wi-Fi, where crypto.randomUUID doesn't). */
export const randomKey = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function countWords(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Dense two-column print fits roughly this many words per letter page. */
export const WORDS_PER_PRINTED_PAGE = 950;

export function estimatePages(words: number) {
  return Math.max(1, Math.ceil(words / WORDS_PER_PRINTED_PAGE));
}
