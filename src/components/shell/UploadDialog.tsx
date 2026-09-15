"use client";

import clsx from "clsx";
import { FileText, Sparkles, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { api, formatBytes } from "@/lib/client";
import type { ClassNode } from "@/lib/types";
import { Button, inputClass } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";

const NEW = "__new__";
const LAST_UNIT_KEY = "upload:lastUnit";

export function UploadDialog({
  open,
  onClose,
  tree,
  aiReady,
  defaultUnitId,
  initialFiles,
}: {
  open: boolean;
  onClose: () => void;
  tree: ClassNode[];
  aiReady: boolean;
  defaultUnitId?: number;
  initialFiles?: File[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Import course PDFs"
      description="Each PDF becomes an editable note you can highlight and add to. The original stays attached."
    >
      {open && (
        <UploadForm tree={tree} aiReady={aiReady} defaultUnitId={defaultUnitId} initialFiles={initialFiles} onDone={onClose} />
      )}
    </Dialog>
  );
}

function findUnit(tree: ClassNode[], unitId: number | undefined) {
  if (!unitId) return null;
  for (const c of tree)
    for (const s of c.sections)
      for (const u of s.units) if (u.id === unitId) return { classId: String(c.id), sectionId: String(s.id), unitId: String(u.id) };
  return null;
}

function Select({
  label,
  value,
  onChange,
  options,
  newLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: number; name: string }[];
  newLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <select
        className={clsx(inputClass, "appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a847a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.id} value={String(o.id)}>
            {o.name}
          </option>
        ))}
        <option value={NEW}>{newLabel}</option>
      </select>
    </label>
  );
}

function UploadForm({
  tree,
  aiReady,
  defaultUnitId,
  initialFiles,
  onDone,
}: {
  tree: ClassNode[];
  aiReady: boolean;
  defaultUnitId?: number;
  initialFiles?: File[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>(() => (initialFiles ?? []).filter(isPdfFile));
  const [dragging, setDragging] = useState(false);

  const initial = useMemo(() => {
    let stored: number | undefined;
    try {
      stored = Number(localStorage.getItem(LAST_UNIT_KEY)) || undefined;
    } catch {}
    return findUnit(tree, defaultUnitId) ?? findUnit(tree, stored);
  }, [tree, defaultUnitId]);

  // Picking a parent selects its first child, or "create new" when it has none.
  const firstSection = (cId: string) => {
    const sections = tree.find((c) => String(c.id) === cId)?.sections ?? [];
    return sections.length ? String(sections[0].id) : NEW;
  };
  const firstUnit = (sId: string) => {
    const units = tree.flatMap((c) => c.sections).find((s) => String(s.id) === sId)?.units ?? [];
    return units.length ? String(units[0].id) : NEW;
  };

  const [classId, setClassId] = useState(() => initial?.classId ?? (tree.length ? String(tree[0].id) : NEW));
  const [sectionId, setSectionId] = useState(() => initial?.sectionId ?? firstSection(classId));
  const [unitId, setUnitId] = useState(() => initial?.unitId ?? firstUnit(sectionId));
  const [newClass, setNewClass] = useState("");
  const [newSection, setNewSection] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [condense, setCondense] = useState(aiReady);
  const [progress, setProgress] = useState<number | null>(null);

  const klass = tree.find((c) => String(c.id) === classId);
  const section = klass?.sections.find((s) => String(s.id) === sectionId);

  const chooseClass = (cId: string) => {
    const sId = cId === NEW ? NEW : firstSection(cId);
    setClassId(cId);
    setSectionId(sId);
    setUnitId(sId === NEW ? NEW : firstUnit(sId));
  };
  const chooseSection = (sId: string) => {
    setSectionId(sId);
    setUnitId(sId === NEW ? NEW : firstUnit(sId));
  };

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const pdfs = incoming.filter(isPdfFile);
    if (pdfs.length < incoming.length) toast("Only PDF files can be uploaded", "info");
    setFiles((current) => {
      const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
      return [...current, ...pdfs.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  const destinationReady =
    (classId !== NEW || newClass.trim()) && (sectionId !== NEW || newSection.trim()) && (unitId !== NEW || newUnit.trim()) && sectionId !== "" && unitId !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length || !destinationReady || progress !== null) return;
    setProgress(0);
    try {
      let cId = Number(classId);
      if (classId === NEW) cId = (await api<{ id: number }>("/api/classes", { json: { name: newClass, color: "sage" } })).id;
      let sId = Number(sectionId);
      if (sectionId === NEW) sId = (await api<{ id: number }>("/api/sections", { json: { class_id: cId, name: newSection } })).id;
      let uId = Number(unitId);
      if (unitId === NEW) uId = (await api<{ id: number }>("/api/units", { json: { section_id: sId, name: newUnit } })).id;

      const form = new FormData();
      form.set("unit_id", String(uId));
      form.set("condense", condense ? "1" : "0");
      for (const f of files) form.append("files", f);

      const result = await uploadWithProgress(form, setProgress);
      try {
        localStorage.setItem(LAST_UNIT_KEY, String(uId));
      } catch {}
      if (result.rejected.length) toast(`Skipped ${result.rejected.map((r) => `${r.name} (${r.reason})`).join(", ")}`, "info");
      if (result.created.length) {
        const n = result.created.length;
        const scanned = result.created.filter((c) => !c.has_text).length;
        toast(
          `Imported ${n} PDF${n > 1 ? "s" : ""} as editable notes${condense ? " — condensing in the background" : ""}` +
            (scanned ? `. ${scanned} had no selectable text (scanned) — open ${scanned > 1 ? "them" : "it"} to convert with AI.` : ""),
        );
      }
      const firstNote = result.created.find((c) => c.note_id)?.note_id;
      router.push(`/units/${uId}?tab=notes${firstNote ? `&note=${firstNote}` : ""}`);
      router.refresh();
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
      setProgress(null);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <form onSubmit={submit} className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken/50 hover:border-accent/60 hover:bg-accent-soft/40",
        )}
      >
        <div className="mb-3 grid size-11 place-items-center rounded-xl bg-card text-accent shadow-[var(--shadow-sm)]">
          <UploadCloud className="size-5" />
        </div>
        <p className="text-[15px] font-medium text-ink">Drag PDFs here or click to browse</p>
        <p className="mt-1 text-[13px] text-ink-3">You can add several at once · up to 100 MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
          {files.map((f) => (
            <li key={`${f.name}:${f.size}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-hover">
              <FileText className="size-4 shrink-0 text-danger/80" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-ink-3 tabular-nums">{formatBytes(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((list) => list.filter((x) => x !== f))}
                className="rounded p-0.5 text-ink-3 hover:bg-card hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold tracking-wider text-ink-3 uppercase">Save to</legend>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select label="Class" value={classId} onChange={chooseClass} options={tree} newLabel="+ New class…" />
          <Select
            label="Section"
            value={sectionId}
            onChange={chooseSection}
            options={klass?.sections ?? []}
            newLabel="+ New section…"
            disabled={!classId}
          />
          <Select
            label="Unit"
            value={unitId}
            onChange={setUnitId}
            options={section?.units ?? []}
            newLabel="+ New unit…"
            disabled={!sectionId}
          />
        </div>
        {(classId === NEW || sectionId === NEW || unitId === NEW) && (
          <div className="flex animate-fade-in flex-col gap-3 sm:flex-row">
            {classId === NEW && (
              <input className={inputClass} placeholder="New class name" value={newClass} onChange={(e) => setNewClass(e.target.value)} maxLength={200} />
            )}
            {sectionId === NEW && (
              <input className={inputClass} placeholder="New section name" value={newSection} onChange={(e) => setNewSection(e.target.value)} maxLength={200} />
            )}
            {unitId === NEW && (
              <input className={inputClass} placeholder="New unit name" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} maxLength={200} />
            )}
          </div>
        )}
      </fieldset>

      <label
        className={clsx(
          "flex items-start gap-3 rounded-xl border border-line p-3.5 transition-colors",
          aiReady ? "cursor-pointer hover:bg-hover" : "opacity-60",
        )}
      >
        <input
          type="checkbox"
          checked={condense}
          disabled={!aiReady}
          onChange={(e) => setCondense(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Sparkles className="size-3.5 text-accent" /> Also condense each PDF with AI
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-3">
            {aiReady
              ? "Creates a dense one-page study sheet per PDF in the background. You can edit it afterwards."
              : "Set up free AI from the sidebar to enable study sheets."}
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-ink-3">
          {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} · ${formatBytes(totalSize)}` : "No files yet"}
        </span>
        <div className="flex items-center gap-2">
          {progress !== null && (
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <Button variant="primary" type="submit" disabled={!files.length || !destinationReady || progress !== null}>
            <UploadCloud />
            {progress === null ? "Upload" : progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Processing…"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function isPdfFile(f: File) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

function uploadWithProgress(
  form: FormData,
  onProgress: (p: number) => void,
): Promise<{
  created: { id: number; title: string; note_id: number | null; has_text: boolean }[];
  rejected: { name: string; reason: string }[];
}> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string; created?: []; rejected?: [] } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve({ created: body.created ?? [], rejected: body.rejected ?? [] });
      else if (xhr.status === 400 && body.rejected?.length) resolve({ created: [], rejected: body.rejected });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(form);
  });
}
