"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { CLASS_COLORS, type ClassColor } from "@/lib/colors";
import type { ClassRow } from "@/lib/types";
import { Button, inputClass } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";

export function ClassDialog({ open, klass, onClose }: { open: boolean; klass?: ClassRow; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={klass ? "Edit class" : "New class"}
      description={klass ? undefined : "Add a course. You'll organize it into sections and units next."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="class-form">
            {klass ? "Save changes" : "Create class"}
          </Button>
        </>
      }
    >
      {open && <ClassForm klass={klass} onDone={onClose} />}
    </Dialog>
  );
}

function ClassForm({ klass, onDone }: { klass?: ClassRow; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [name, setName] = useState(klass?.name ?? "");
  const [code, setCode] = useState(klass?.code ?? "");
  const [color, setColor] = useState<ClassColor>((klass?.color as ClassColor) ?? "sage");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (klass) {
        await api(`/api/classes/${klass.id}`, { method: "PATCH", json: { name, code, color } });
        toast("Class updated");
        router.refresh();
      } else {
        const { id } = await api<{ id: number }>("/api/classes", { json: { name, code, color } });
        toast("Class created");
        router.push(`/classes/${id}`);
        router.refresh();
      }
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save class", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="class-form" onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="class-name">
          Class name
        </label>
        <input
          id="class-name"
          autoFocus
          required
          maxLength={200}
          className={inputClass}
          placeholder="Research Methods"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor="class-code">
          Course code <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id="class-code"
          maxLength={40}
          className={inputClass}
          placeholder="PSYC 610"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div>
        <span className="mb-2 block text-[13px] font-medium text-ink-2">Color</span>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(CLASS_COLORS) as [ClassColor, string][]).map(([key, hex]) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              title={key}
              onClick={() => setColor(key)}
              className={clsx(
                "grid size-9 place-items-center rounded-full transition-transform hover:scale-110",
                color === key && "ring-2 ring-offset-2 ring-offset-card",
              )}
              style={{ background: hex, ["--tw-ring-color" as string]: hex }}
            >
              {color === key && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
