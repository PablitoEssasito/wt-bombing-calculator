"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { favoriteAircraft } from "@/lib/local-list";
import { toast } from "@/lib/toast";
import { favoritesTouched, unseenChanges, type RecentChange } from "@/lib/whats-new";

/**
 * "What's new since you were last here": a dot on the Changelog link while
 * there's an entry the player hasn't opened, a one-off toast when it touches
 * one of their favourites, and a "New" tag on those entries once they look.
 *
 * All of it keys off the newest entry the player has seen, kept in this
 * browser. A first visit records the current entry silently — everything is
 * new to a newcomer, so nothing is worth flagging.
 */
const SEEN_KEY = "wtbc:changelog-seen";
const TOASTED_KEY = "wtbc:changelog-toasted";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage denied — the dot just comes back next time.
  }
}

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const notify = () => {
  for (const listener of listeners) listener();
};

/** The dot beside the Changelog link. */
export function ChangelogDot({ latestKey }: { latestKey: string | null }) {
  const { m } = useI18n();
  const show = useSyncExternalStore(
    subscribe,
    () => {
      const seen = load(SEEN_KEY);
      return latestKey !== null && seen !== null && seen !== latestKey;
    },
    () => false,
  );
  if (!show) return null;
  return (
    <span className="ml-1 inline-block size-1.5 -translate-y-1.5 rounded-full bg-accent" aria-label={m.nav.newChanges} />
  );
}

/** Rendered once per page load: records a first visit, and tells a returning player about their favourites. */
export function WhatsNewToast({ changes }: { changes: RecentChange[] }) {
  const router = useRouter();
  const { m, count, fill, path } = useI18n();
  const latest = changes[0]?.key ?? null;

  // Once per page load, against the favourites as they stand then — not again
  // each time a star is toggled, which would toast mid-visit.
  useEffect(() => {
    if (latest === null) return;
    const seen = load(SEEN_KEY);
    if (seen === null) {
      save(SEEN_KEY, latest);
      notify();
      return;
    }
    if (seen === latest || load(TOASTED_KEY) === latest) return;
    const fresh = unseenChanges(changes, seen);
    const mine = favoritesTouched(fresh, favoriteAircraft());
    if (mine.length === 0) return;
    save(TOASTED_KEY, latest);
    const patch = fresh[0]?.version ? fill(m.changelog.inPatch, { version: fresh[0].version }) : "";
    toast(count(m.changelog.favoritesChanged, mine.length, { patch }), {
      action: { label: m.changelog.see, onClick: () => router.push(path("/changelog/")) },
    });
    // Once per page load (see above) — the words are fixed for the load too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, latest, router]);

  return null;
}

/** Entry keys that were unseen when the changelog page opened. */
const UnseenEntries = createContext<readonly string[]>([]);

/**
 * Wraps the changelog's entries: notes which were unseen as the page opened —
 * read before marking them seen — then marks them all seen.
 */
export function ChangelogSeen({ keys, children }: { keys: string[]; children: React.ReactNode }) {
  const [unseenKeys, setUnseenKeys] = useState<readonly string[]>([]);
  // Read once: running this again (Strict Mode does, in development) would
  // find the entries already marked seen and wipe the tags.
  const read = useRef(false);
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const seen = load(SEEN_KEY);
    const fresh = unseenChanges(
      keys.map((key) => ({ key, version: null, touched: [] })),
      seen,
    ).map((change) => change.key);
    if (keys[0]) save(SEEN_KEY, keys[0]);
    notify();
    // Known only once this browser's storage has been read, after hydration.
    setUnseenKeys(fresh);
  }, [keys]);
  return <UnseenEntries.Provider value={unseenKeys}>{children}</UnseenEntries.Provider>;
}

/** "New" beside an entry that was unseen when the page opened. */
export function NewTag({ entryKey }: { entryKey: string }) {
  const { m } = useI18n();
  const isNew = useContext(UnseenEntries).includes(entryKey);
  if (!isNew) return null;
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-ground">{m.changelog.new}</span>
  );
}
