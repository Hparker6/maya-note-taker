"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { CanvasStatus, ClassNode } from "@/lib/types";
import { CanvasDialog } from "../calendar/CanvasDialog";
import { Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Canvas connection settings, reachable from anywhere in the app. */
export function CanvasSettingsDialog({ open, onClose, tree }: { open: boolean; onClose: () => void; tree: ClassNode[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<CanvasStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<CanvasStatus>("/api/canvas")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Follow a sync that's running in the background.
  useEffect(() => {
    if (!open || !status?.syncing) return;
    const timer = setInterval(async () => {
      try {
        const next = await api<CanvasStatus>("/api/canvas");
        if (!next.syncing) {
          setStatus(next);
          router.refresh();
        }
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [open, status?.syncing, router]);

  if (open && !status) {
    return (
      <Dialog open onClose={onClose} title="Canvas sync">
        <div className="grid h-32 place-items-center">
          <Spinner />
        </div>
      </Dialog>
    );
  }
  if (!status) return null;

  return (
    <CanvasDialog
      open={open}
      onClose={onClose}
      status={status}
      tree={tree}
      onStatus={(next) => {
        setStatus(next);
        router.refresh();
      }}
    />
  );
}
