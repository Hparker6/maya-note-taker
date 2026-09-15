"use client";

import { Check, Copy, Download, Link2, Trash2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, inputClass, Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";

export interface ShareTarget {
  scope: "class" | "unit" | "note";
  id: number;
  title: string;
}

interface Include {
  notes: boolean;
  lectures: boolean;
  sheets: boolean;
  practice: boolean;
}

interface LinkRow {
  token: string;
  url: string;
  lan_url: string | null;
  include: Include;
  views: number;
  created_at: string;
}

const INCLUDE_LABELS: [keyof Include, string][] = [
  ["notes", "My notes (with handwriting)"],
  ["lectures", "Lecture notes from PDFs"],
  ["sheets", "Study sheets"],
  ["practice", "Flashcards and quiz questions"],
];

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API over plain http on another device; fall back to a temporary text field.
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;left:-10000px";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

export function ShareDialog({ target, onClose }: { target: ShareTarget | null; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [include, setInclude] = useState<Include>({ notes: true, lectures: true, sheets: true, practice: true });
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const scope = target?.scope;
  const id = target?.id;
  useEffect(() => {
    if (!scope || !id) return;
    let cancelled = false;
    api<{ links: LinkRow[]; lan_origin: string | null }>(`/api/shares?scope=${scope}&id=${id}`)
      .then((res) => {
        if (cancelled) return;
        setLinks(res.links);
        setLanOrigin(res.lan_origin);
      })
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [scope, id]);

  if (!target) return <Dialog open={false} onClose={onClose} title="Share" />;

  const query = new URLSearchParams({ scope: target.scope, id: String(target.id), ...Object.fromEntries(Object.entries(include).map(([k, v]) => [k, v ? "1" : "0"])) });
  const nothingSelected = target.scope !== "note" && !Object.values(include).some(Boolean);

  const createLink = async () => {
    setCreating(true);
    try {
      const link = await api<LinkRow>("/api/shares", { json: { scope: target.scope, id: target.id, include } });
      setLinks((list) => [link, ...(list ?? [])]);
      await copy(link.lan_url ?? link.url, link.token);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't create a link", "error");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (text: string, token: string) => {
    if (await copyText(text)) {
      setCopied(token);
      toast("Link copied");
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } else {
      toast("Couldn't copy — select the link and copy it", "error");
    }
  };

  const stop = async (link: LinkRow) => {
    const ok = await confirm({ title: "Stop sharing this link?", message: "Anyone who has it won't be able to open it anymore.", confirmLabel: "Stop sharing", danger: true });
    if (!ok) return;
    await api(`/api/shares/${link.token}`, { method: "DELETE" }).catch(() => toast("Couldn't stop sharing", "error"));
    setLinks((list) => (list ?? []).filter((l) => l.token !== link.token));
  };

  const onThisComputerOnly = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  return (
    <Dialog open onClose={onClose} size="lg" title={`Share “${target.title}”`} description="Classmates get a read-only copy. They can't change your notes.">
      <div className="space-y-6">
        {target.scope !== "note" && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">What to include</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INCLUDE_LABELS.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm hover:bg-hover">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={include[key]} onChange={(e) => setInclude({ ...include, [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">Original PDF files aren&apos;t included.</p>
          </fieldset>
        )}

        <section className="rounded-2xl border border-line p-4">
          <h3 className="flex items-center gap-2 font-medium">
            <Download className="size-4 text-accent" /> Send a file <span className="text-xs font-normal text-ink-3">— works right away</span>
          </h3>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            Download one page with everything, then send it by email, text or a Canvas message. It opens in any browser, and classmates with this app can import it.
          </p>
          <a
            href={nothingSelected ? undefined : `/api/share/export?${query}`}
            aria-disabled={nothingSelected}
            className={`mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-ink shadow-[var(--shadow-sm)] hover:bg-accent-hover ${nothingSelected ? "pointer-events-none opacity-50" : ""}`}
          >
            <Download className="size-4" /> Download share file
          </a>
        </section>

        <section className="rounded-2xl border border-line p-4">
          <h3 className="flex items-center gap-2 font-medium">
            <Link2 className="size-4 text-accent" /> Share a link
          </h3>
          <p className="mt-1.5 text-[13.5px] text-ink-2">
            {onThisComputerOnly
              ? lanOrigin
                ? "Classmates on the same Wi-Fi can open it while this computer is on and the notebook is running. Once the app is online, links work anywhere."
                : "Links need the notebook to be reachable by your classmates, like on the same Wi-Fi or once the app is online. For now, the file is the easiest way."
              : "Anyone with the link can view it while the notebook is running."}
          </p>
          <Button className="mt-3" onClick={createLink} disabled={creating || nothingSelected}>
            {creating ? <Spinner className="size-3.5" /> : <Link2 />} Create link
          </Button>

          {links === null ? (
            <div className="mt-3 h-10 animate-pulse rounded-lg bg-sunken" />
          ) : (
            links.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => {
                  const shown = onThisComputerOnly && link.lan_url ? link.lan_url : link.url;
                  return (
                    <li key={link.token} className="rounded-xl bg-paper/60 p-2.5">
                      <div className="flex items-center gap-2">
                        {onThisComputerOnly && link.lan_url && <Wifi className="size-4 shrink-0 text-ink-3" aria-label="Same Wi-Fi link" />}
                        <input readOnly value={shown} onFocus={(e) => e.target.select()} className={`${inputClass} h-9 font-mono text-xs`} aria-label="Share link" />
                        <Button size="icon" onClick={() => copy(shown, link.token)} aria-label="Copy link" title="Copy link">
                          {copied === link.token ? <Check className="text-success" /> : <Copy />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => stop(link)} aria-label="Stop sharing" title="Stop sharing" className="hover:text-danger">
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="mt-1 pl-1 text-[11.5px] text-ink-3">
                        Opened {link.views} time{link.views === 1 ? "" : "s"} ·{" "}
                        {target.scope === "note" ? "Read-only" : INCLUDE_LABELS.filter(([k]) => link.include[k]).map(([, label]) => label.split(" (")[0]).join(", ")}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </section>
      </div>
    </Dialog>
  );
}
