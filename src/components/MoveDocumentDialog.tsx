"use client";

import clsx from "clsx";
import { useState } from "react";
import { api } from "@/lib/client";
import { classColor } from "@/lib/colors";
import type { ClassNode, DocumentRow } from "@/lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { useFeedback } from "./ui/feedback";

export function MoveDocumentDialog({
  document,
  tree,
  onClose,
  onMoved,
}: {
  document: Pick<DocumentRow, "id" | "title" | "unit_id"> | null;
  tree: ClassNode[];
  onClose: () => void;
  onMoved: (unitId: number) => void;
}) {
  const { toast } = useFeedback();
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const move = async () => {
    if (!document || !target) return;
    setBusy(true);
    try {
      await api(`/api/documents/${document.id}`, { method: "PATCH", json: { unit_id: target } });
      toast("PDF moved");
      onMoved(target);
      setTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't move PDF", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(document)}
      onClose={() => {
        setTarget(null);
        onClose();
      }}
      title="Move PDF"
      description={document ? `Choose a new unit for “${document.title}”. Notes taken on it move too.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={move} disabled={!target || busy}>
            Move here
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {tree.map((c) => (
          <div key={c.id}>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
              <span className="size-2 rounded-full" style={{ background: classColor(c.color) }} />
              {c.name}
            </div>
            {c.sections.map((s) => (
              <div key={s.id} className="mb-2 ml-4">
                <div className="mb-1 text-[13px] text-ink-3">{s.name}</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.units.map((u) => {
                    const current = u.id === document?.unit_id;
                    return (
                      <button
                        key={u.id}
                        disabled={current}
                        onClick={() => setTarget(u.id)}
                        className={clsx(
                          "rounded-lg border px-2.5 py-1 text-[13px] transition-colors disabled:cursor-default disabled:opacity-50",
                          target === u.id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-hover",
                        )}
                      >
                        {u.name}
                        {current && " (current)"}
                      </button>
                    );
                  })}
                  {!s.units.length && <span className="text-xs text-ink-3">No units</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
