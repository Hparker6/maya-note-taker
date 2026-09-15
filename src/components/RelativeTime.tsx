"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/client";

/** Renders "5m ago" after mount (and keeps it fresh) without hydration mismatches. */
export function RelativeTime({ iso, prefix }: { iso: string; prefix?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {prefix}
      {label ?? " "}
    </time>
  );
}
