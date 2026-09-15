"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-[15px] text-ink-3">Your notes are safe. Try again, and if it keeps happening, restart the app.</p>
      <Button variant="primary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
