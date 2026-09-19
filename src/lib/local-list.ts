"use client";

import { useSyncExternalStore } from "react";

const RECENT_KEY = "wtbc:recent";
const FAVORITES_KEY = "wtbc:favorites";
const RECENT_LIMIT = 8;

/**
 * Same shared-listener shape as use-url-state.ts's subscribe/notify — writes
 * here don't dispatch a browser event the way another tab's storage write
 * does, so components reading these lists need their own notify to pick up
 * a change made elsewhere in this same tab.
 */
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// useSyncExternalStore requires getSnapshot to return the *same reference*
// when nothing has changed — re-parsing JSON on every call hands back a new
// array each time even when the underlying value is identical, which reads
// to React as "this store never stops changing" and blows the render loop
// (confirmed: "Maximum update depth exceeded", not a hypothetical). Caching
// the last parsed list per key, keyed off the raw string, is what makes two
// consecutive reads of an unchanged value `===` again.
const cache = new Map<string, { raw: string | null; list: string[] }>();

function read(key: string): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.list;

  let list: string[];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    // Corrupt JSON — an empty list is the only sane fallback, not a thrown
    // error over a QOL feature.
    list = [];
  }
  cache.set(key, { raw, list });
  return list;
}

function write(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage denied or full — the list just doesn't persist this time.
  }
  notify();
}

const EMPTY: string[] = [];
const readServer = () => EMPTY;

export function useRecentAircraft(): string[] {
  return useSyncExternalStore(subscribe, () => read(RECENT_KEY), readServer);
}

export function recordRecentAircraft(id: string) {
  const current = read(RECENT_KEY).filter((existing) => existing !== id);
  write(RECENT_KEY, [id, ...current].slice(0, RECENT_LIMIT));
}

export function useFavoriteAircraft(): string[] {
  return useSyncExternalStore(subscribe, () => read(FAVORITES_KEY), readServer);
}

export function toggleFavoriteAircraft(id: string): void {
  const current = read(FAVORITES_KEY);
  const next = current.includes(id) ? current.filter((existing) => existing !== id) : [id, ...current];
  write(FAVORITES_KEY, next);
}
