"use client";

import { useCallback, useSyncExternalStore } from "react";

const LOCAL_EVENT = "local-storage-change";
const noopSubscribe = () => () => {};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A localStorage value that is `null` during SSR/hydration and stays in sync across tabs. */
export function useLocalStorage(key: string): [string | null, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) onChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(LOCAL_EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(LOCAL_EVENT, handler);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => read(key), () => null);
  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {}
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key],
  );
  return [value, set];
}

/** False during SSR and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useIsDarkTheme() {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === "dark", () => false);
}
