"use client";

import { useSyncExternalStore } from "react";

export type UrlCodec<T> = {
  fallback: T;
  parse: (raw: string) => T | null;
  /** Return null to leave the parameter out of the URL entirely. */
  serialize: (value: T) => string | null;
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // replaceState is silent, so our own writes call notify() directly; this covers
  // the browser's own navigation.
  window.addEventListener("popstate", notify);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", notify);
  };
}

const readSearch = () => window.location.search;

/** No query string exists while prerendering, so every control starts at its default. */
const readServerSearch = () => "";

/**
 * Component state that lives in the query string.
 *
 * Deliberately not built on `useSearchParams`: reading that anywhere in a
 * statically exported page opts the whole subtree out of prerendering, which
 * would leave every aircraft page an empty shell for crawlers and for anyone on a
 * slow connection. Subscribing to the URL directly keeps the first render
 * identical on both sides — the defaults — and applies the real parameters as
 * soon as React takes over.
 *
 * Writes use replaceState, so changing a filter does not bury the previous page
 * under a pile of history entries. Links stay shareable either way.
 */
export function useUrlState<T>(key: string, codec: UrlCodec<T>): [T, (value: T) => void] {
  const search = useSyncExternalStore(subscribe, readSearch, readServerSearch);

  const raw = new URLSearchParams(search).get(key);
  const value = raw === null ? codec.fallback : (codec.parse(raw) ?? codec.fallback);

  const update = (next: T) => {
    const params = new URLSearchParams(window.location.search);
    const serialized = codec.serialize(next);
    if (serialized === null) params.delete(key);
    else params.set(key, serialized);

    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    notify();
  };

  return [value, update];
}

export function urlInteger(fallback: number): UrlCodec<number> {
  return {
    fallback,
    parse: (raw) => (raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null),
    serialize: (value) => (value === fallback ? null : String(value)),
  };
}

export function urlLiteral<T extends string>(options: readonly T[], fallback: T): UrlCodec<T> {
  return {
    fallback,
    parse: (raw) => (options.includes(raw as T) ? (raw as T) : null),
    serialize: (value) => (value === fallback ? null : value),
  };
}

export function urlText(fallback = ""): UrlCodec<string> {
  return {
    fallback,
    parse: (raw) => raw,
    serialize: (value) => (value.trim() === "" ? null : value),
  };
}
