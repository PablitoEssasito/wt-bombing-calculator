"use client";

import { useSyncExternalStore } from "react";

/**
 * What the player brings to every sortie, whatever they fly: a premium account
 * and the boosters they have running. Kept in this browser only — it's the
 * player's own account, not something a shared link should carry. A talisman
 * is per aircraft, so it lives with the lists in local-list.ts.
 */
export type RewardProfile = {
  premiumAccount: boolean;
  /** Active boosters, in percent. */
  boostersSl: number[];
  boostersRp: number[];
};

const KEY = "wtbc:reward-profile";
const EMPTY: RewardProfile = { premiumAccount: false, boostersSl: [], boostersRp: [] };

const listeners = new Set<() => void>();
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === "number" && n > 0) : [];

// The same reference for an unchanged value, which useSyncExternalStore needs
// (see local-list.ts for what happens otherwise).
let cached: { raw: string | null; profile: RewardProfile } = { raw: null, profile: EMPTY };

function read(): RewardProfile {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cached.raw) return cached.profile;

  let profile = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    profile = {
      premiumAccount: parsed.premiumAccount === true,
      boostersSl: numbers(parsed.boostersSl),
      boostersRp: numbers(parsed.boostersRp),
    };
  } catch {
    // Corrupt JSON — start from nothing rather than break the page.
  }
  cached = { raw, profile };
  return profile;
}

export function useRewardProfile(): RewardProfile {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function updateRewardProfile(change: Partial<RewardProfile>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...change }));
  } catch {
    // Storage denied or full — the change just doesn't persist.
  }
  for (const listener of listeners) listener();
}
