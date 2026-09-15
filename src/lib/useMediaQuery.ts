"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Server render assumes the query matches; the client corrects after hydration. */
export function useMediaQuery(query: string, serverValue = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
