import type { AircraftSummary } from "@/lib/dataset";

/**
 * How the game's own tile treats this aircraft: gold for a premium bought
 * outright, green for a squadron vehicle earned through a squadron's own
 * activity, neither for anything researched the ordinary way. The two never
 * overlap in the source data, but premium is checked first regardless — it is
 * the sheet's own per-row field, where squadron is read off the wiki's match
 * and so is the one more likely to be wrong for an aircraft this sees for the
 * first time.
 */
export function rewardKindOf(plane: AircraftSummary): "premium" | "squadron" | null {
  if (plane.premium) return "premium";
  if (plane.squadron) return "squadron";
  return null;
}

/** The gold/green radial-gradient tint globals.css defines for a reward-kind tile. */
export const REWARD_TINT = { premium: "tile-premium", squadron: "tile-squadron" } as const;
