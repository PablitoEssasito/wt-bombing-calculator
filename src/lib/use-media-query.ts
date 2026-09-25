"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept live as the window changes. False while
 * prerendering — there is no window to ask — so the first render is the wide
 * layout on both sides, and a phone switches right after hydration.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
