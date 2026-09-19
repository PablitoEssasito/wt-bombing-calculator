"use client";

import { sendGAEvent } from "@next/third-parties/google";

/**
 * Every filter and sort control on this site writes to the URL through
 * `replaceState` (see use-url-state.ts), not `pushState` — deliberately, so
 * changing a filter doesn't bury the previous page under history entries.
 * GA's own SPA page-view detection only ever patches `pushState`, so none of
 * that — search terms, which filters people actually use, whether they
 * stray from the recommended loadout — reaches Analytics unless sent
 * explicitly. That's what every `track()` call below is for.
 */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
  sendGAEvent("event", name, params);
}

/** Trimmed to GA4's ~100-character event-param limit before it gets there anyway. */
export function describeError(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return text.slice(0, 150);
}
