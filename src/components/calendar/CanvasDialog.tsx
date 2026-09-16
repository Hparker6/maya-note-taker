"use client";

import { AlertTriangle, CheckCircle2, KeyRound, Link2, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client";
import type { CanvasStatus, ClassNode } from "@/lib/types";
import { RelativeTime } from "../RelativeTime";
import { Button, inputClass, Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-2.5">
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{n}</span>
    <span>{children}</span>
  </li>
);

export function CanvasDialog({
  open,
  onClose,
  status,
  onStatus,
  tree,
}: {
  open: boolean;
  onClose: () => void;
  status: CanvasStatus;
  onStatus: (status: CanvasStatus) => void;
  tree: ClassNode[];
}) {
  const { toast, confirm } = useFeedback();
  const [feedUrl, setFeedUrl] = useState("");
  const [apiUrl, setApiUrl] = useState(status.apiBaseUrl ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<null | "feed" | "api" | "sync">(null);

  const connected = Boolean(status.feedUrl || status.tokenHint);

  const report = (next: CanvasStatus) => {
    onStatus(next);
    if (next.lastSync) toast(next.lastSync.message, next.lastSync.ok ? "success" : "error");
  };

  const save = async (which: "feed" | "api") => {
    setBusy(which);
    try {
      const body = which === "feed" ? { feed_url: feedUrl } : { api_url: apiUrl, token: token || undefined };
      report(await api<CanvasStatus>("/api/canvas", { method: "PUT", json: body }));
      if (which === "feed") setFeedUrl("");
      else setToken("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't connect to Canvas", "error");
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    try {
      report(await api<CanvasStatus>("/api/canvas/sync", { method: "POST" }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sync failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Canvas?",
      message:
        "The saved link, token and grades are removed, and synced Canvas events disappear from your calendar. Events you added yourself stay, and so do any assignments you wrote notes on or ticked off — they become your own events.",
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    onStatus(await api<CanvasStatus>("/api/canvas", { method: "DELETE" }));
    toast("Canvas disconnected");
  };

  const linkCourse = async (courseKey: string, classId: string) => {
    try {
      onStatus(await api<CanvasStatus>("/api/canvas/courses", { method: "PUT", json: { course_key: courseKey, class_id: classId ? Number(classId) : null } }));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't link the course", "error");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Canvas sync"
      description="Bring every due date, quiz and exam from Canvas into your calendar. It re-syncs automatically every hour."
    >
      <div className="space-y-6">
        {connected && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/60 px-4 py-3">
            {status.lastSync?.ok === false ? (
              <AlertTriangle className="size-5 text-[var(--tc-orange)]" />
            ) : (
              <CheckCircle2 className="size-5 text-accent" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">
                Connected{status.lastSync ? ` · ${status.lastSync.events} Canvas item${status.lastSync.events === 1 ? "" : "s"}` : ""}
              </div>
              <div className="text-xs text-ink-3">
                {status.syncing || busy === "sync" ? (
                  "Syncing…"
                ) : status.lastSync ? (
                  <>
                    <RelativeTime iso={status.lastSync.at} prefix="Last synced " />
                    {!status.lastSync.ok && <span className="text-[var(--tc-orange)]"> · {status.lastSync.message}</span>}
                  </>
                ) : (
                  "Not synced yet"
                )}
              </div>
            </div>
            <Button size="sm" onClick={syncNow} disabled={Boolean(busy)}>
              {busy === "sync" ? <Spinner className="size-3.5" /> : <RefreshCw />} Sync now
            </Button>
          </div>
        )}

        <section>
          <h3 className="flex items-center gap-2 font-medium">
            <Link2 className="size-4 text-accent" /> Calendar feed link <span className="text-xs font-normal text-ink-3">— easiest</span>
          </h3>
          <ol className="mt-2 space-y-1.5 text-[13.5px] text-ink-2">
            <Step n={1}>In Canvas, open <strong>Calendar</strong> from the left menu.</Step>
            <Step n={2}>
              Click <strong>Calendar Feed</strong> (bottom right) and copy the link — the same one you&apos;d give Google Calendar.
            </Step>
            <Step n={3}>Paste it here. Brings in every assignment, quiz and exam date with its description.</Step>
          </ol>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (feedUrl.trim()) void save("feed");
            }}
          >
            <input
              className={inputClass}
              placeholder={status.feedUrl ? `Saved: ${status.feedUrl}` : "https://yourschool.instructure.com/feeds/calendars/user_….ics"}
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={!feedUrl.trim() || Boolean(busy)}>
              {busy === "feed" ? <Spinner className="size-3.5" /> : null} {status.feedUrl ? "Replace" : "Connect"}
            </Button>
          </form>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4 text-accent" /> Canvas access token <span className="text-xs font-normal text-ink-3">— adds points, grade weights & submissions</span>
          </h3>
          <ol className="mt-2 space-y-1.5 text-[13.5px] text-ink-2">
            <Step n={1}>
              In Canvas, open <strong>Account → Settings</strong>.
            </Step>
            <Step n={2}>
              Under <strong>Approved Integrations</strong>, click <strong>+ New Access Token</strong>, name it &ldquo;Notebook&rdquo;, and copy the token.
            </Step>
            <Step n={3}>Enter your school&apos;s Canvas address and the token. (Some schools turn tokens off — the feed link still works.)</Step>
          </ol>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (apiUrl.trim() && (token.trim() || status.tokenHint)) void save("api");
            }}
          >
            <input className={inputClass} placeholder="yourschool.instructure.com" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              placeholder={status.tokenHint ? `Saved token ${status.tokenHint}` : "Access token"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={!apiUrl.trim() || (!token.trim() && !status.tokenHint) || Boolean(busy)}>
              {busy === "api" ? <Spinner className="size-3.5" /> : null} {status.tokenHint ? "Update" : "Connect"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-3">The token is stored only in this app&apos;s database and is never shown again.</p>
        </section>

        {status.courses.length > 0 && (
          <section className="border-t border-line pt-5">
            <h3 className="font-medium">Your Canvas courses</h3>
            <p className="mt-1 text-[13px] text-ink-3">Match each course to a class so its events get the class color and link to your notes.</p>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {status.courses.map((course) => (
                <li key={course.course_key} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{course.label || "Unnamed course"}</div>
                    <div className="text-xs text-ink-3">
                      {course.event_count} item{course.event_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <select className={`${inputClass} sm:w-56`} value={course.class_id ?? ""} onChange={(e) => linkCourse(course.course_key, e.target.value)}>
                    <option value="">Not linked</option>
                    {tree.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} · ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        )}

        {connected && (
          <div className="border-t border-line pt-4">
            <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={disconnect}>
              <Unplug /> Disconnect Canvas
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
