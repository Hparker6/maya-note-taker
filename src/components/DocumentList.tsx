"use client";

import clsx from "clsx";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, formatBytes } from "@/lib/client";
import { useLocalStorage } from "@/lib/useStorage";
import { RelativeTime } from "./RelativeTime";
import { MoveDocumentDialog } from "./MoveDocumentDialog";
import { useShell } from "./shell/ShellContext";
import { Button, buttonClass, Spinner } from "./ui/Button";
import { useFeedback } from "./ui/feedback";
import { Menu } from "./ui/Menu";
import type { UnitDocument } from "./views/UnitView";

const CONDENSE_KEY = "upload:condense";

export async function startCondensing(documentId: number) {
  const res = await fetch(`/api/sheets/document/${documentId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't start condensing.");
  }
  // Generation continues server-side; we only needed to kick it off.
  await res.body?.cancel();
}

export function DocumentList({
  unitId,
  documents,
  aiReady,
  onChanged,
}: {
  unitId: number;
  documents: UnitDocument[];
  aiReady: boolean;
  onChanged: () => void;
}) {
  const { toast, confirm, prompt } = useFeedback();
  const { tree } = useShell();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [condensePref, setCondensePref] = useLocalStorage(CONDENSE_KEY);
  const condense = aiReady && condensePref !== "0";
  const [moving, setMoving] = useState<UnitDocument | null>(null);
  const router = useRouter();

  // Refresh statuses while anything is condensing in the background.
  const anyCondensing = documents.some((d) => d.condensing);
  useEffect(() => {
    if (!anyCondensing) return;
    const timer = setInterval(onChanged, 4000);
    return () => clearInterval(timer);
  }, [anyCondensing, onChanged]);

  const upload = (files: File[]) => {
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      toast("Only PDF files can be uploaded", "info");
      return;
    }
    const form = new FormData();
    form.set("unit_id", String(unitId));
    form.set("condense", condense ? "1" : "0");
    pdfs.forEach((f) => form.append("files", f));

    setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(e.loaded / e.total);
    xhr.onload = () => {
      setProgress(null);
      let body: { error?: string; created?: unknown[]; rejected?: { name: string; reason: string }[] } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (body.rejected?.length) toast(`Skipped ${body.rejected.map((r) => `${r.name} (${r.reason})`).join(", ")}`, "info");
      if (xhr.status >= 200 && xhr.status < 300) {
        const n = body.created?.length ?? 0;
        toast(`Uploaded ${n} PDF${n === 1 ? "" : "s"}${condense ? " — condensing in the background" : ""}`);
        onChanged();
      } else if (!body.rejected?.length) {
        toast(body.error ?? "Upload failed", "error");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast("Upload failed — check your connection.", "error");
    };
    xhr.send(form);
  };

  const rename = async (doc: UnitDocument) => {
    const title = await prompt({ title: "Rename PDF", label: "Title", initial: doc.title });
    if (!title || title === doc.title) return;
    try {
      await api(`/api/documents/${doc.id}`, { method: "PATCH", json: { title } });
      toast("PDF renamed");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't rename", "error");
    }
  };

  const remove = async (doc: UnitDocument) => {
    const ok = await confirm({
      title: `Delete “${doc.title}”?`,
      message: "The PDF and its condensed sheet are deleted. Notes you took on it stay in this unit.",
      confirmLabel: "Delete PDF",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/documents/${doc.id}`, { method: "DELETE" });
      toast("PDF deleted");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete", "error");
    }
  };

  const condenseOne = async (doc: UnitDocument) => {
    try {
      await startCondensing(doc.id);
      toast(`Condensing “${doc.title}”…`, "info");
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't start", "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6 sm:px-10">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragEnter={(e) => e.stopPropagation()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        className={clsx(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-6 transition-colors sm:flex-row",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-paper/60",
        )}
      >
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-accent shadow-[var(--shadow-sm)]">
          {progress !== null ? <Spinner className="size-5" /> : <UploadCloud className="size-5" />}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="font-medium">{progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : "Drop PDFs into this unit"}</p>
          <label className={clsx("mt-1 inline-flex items-center gap-2 text-[13px] text-ink-3", aiReady ? "cursor-pointer" : "opacity-60")}>
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--accent)]"
              checked={condense}
              disabled={!aiReady}
              onChange={(e) => setCondensePref(e.target.checked ? "1" : "0")}
            />
            Condense each one into a study sheet with Claude
          </label>
        </div>
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={progress !== null}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {documents.length === 0 ? (
        <p className="py-14 text-center text-[15px] text-ink-3">No PDFs in this unit yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {documents.map((doc) => (
            <li key={doc.id} className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-hover/60">
              <div className="grid h-12 w-10 shrink-0 place-items-center rounded-md border border-line bg-paper text-danger/80">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/documents/${doc.id}`} className="block truncate font-medium after:absolute after:inset-0 hover:underline">
                  {doc.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
                  <span>{doc.page_count ? `${doc.page_count} page${doc.page_count === 1 ? "" : "s"}` : "PDF"}</span>
                  <span>·</span>
                  <span>{formatBytes(doc.size)}</span>
                  <span>·</span>
                  <RelativeTime iso={doc.created_at} prefix="Added " />
                  {doc.note_count > 0 && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <NotebookPen className="size-3" /> {doc.note_count}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="relative z-10 flex items-center gap-2">
                {doc.condensing ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                    <Spinner className="size-3" /> Condensing
                  </span>
                ) : doc.has_sheet ? (
                  <Link
                    href={`/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:brightness-95"
                  >
                    <CheckCircle2 className="size-3.5" /> Condensed
                  </Link>
                ) : aiReady ? (
                  <Button size="sm" variant="ghost" onClick={() => condenseOne(doc)}>
                    <Sparkles /> Condense
                  </Button>
                ) : null}
                <Menu
                  triggerClassName={buttonClass("ghost", "icon-sm")}
                  trigger={<MoreHorizontal />}
                  items={[
                    { label: "Open", icon: <ExternalLink />, onSelect: () => router.push(`/documents/${doc.id}`) },
                    { label: "Rename", icon: <Pencil />, onSelect: () => rename(doc) },
                    { label: "Move to another unit", icon: <FolderInput />, onSelect: () => setMoving(doc) },
                    {
                      label: "Download",
                      icon: <Download />,
                      onSelect: () => window.open(`/api/documents/${doc.id}/file?download=1`, "_blank"),
                    },
                    { label: "Delete PDF", icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => remove(doc) },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <MoveDocumentDialog
        document={moving}
        tree={tree}
        onClose={() => setMoving(null)}
        onMoved={() => {
          setMoving(null);
          onChanged();
        }}
      />
    </div>
  );
}
