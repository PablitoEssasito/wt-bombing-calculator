import type { LoadoutOption } from "./types";

/** Where the source stands on a loadout, going by what its own note says. */
export type Stance = "recommended" | "discouraged" | "neutral";

export function stanceOf(option: LoadoutOption): Stance {
  if (option.noteMarker === "star") return "recommended";
  if (option.discouraged) return "discouraged";
  return "neutral";
}

/** One loadout weighed up under a single set of match conditions. */
export type Candidate = {
  option: LoadoutOption;
  /** Bases it flattens under those conditions. */
  basesDestroyed: number;
  /** Bombs carried, which settles a tie between two equally rewarding loadouts. */
  bombCount: number;
};

const RANK: Record<Stance, number> = { recommended: 0, neutral: 1, discouraged: 2 };

/** Positive when a is the better loadout to show. */
function compare(a: Candidate, b: Candidate): number {
  return (
    RANK[stanceOf(b.option)] - RANK[stanceOf(a.option)] ||
    (a.option.rewardMultiplier ?? 0) - (b.option.rewardMultiplier ?? 0) ||
    b.bombCount - a.bombCount
  );
}

/**
 * How many bases to plan for when the player has not said.
 *
 * Where the source has an opinion it stars one loadout, and that star is the
 * answer to this question: the author weighs how long the aircraft survives and
 * what the payload costs in research, neither of which the damage columns know.
 * So the star sets the target rather than being filtered out by it.
 *
 * Without a star, aim to clear the map once — but only as far as a loadout the
 * author does not argue against reaches. Several jets get one base further only
 * on a loadout whose note says not to take it, and stretching for that base is
 * what puts the warning on screen as the default answer.
 */
export function defaultTarget(candidates: Candidate[], baseCount: number): number {
  const starred = candidates.find((c) => stanceOf(c.option) === "recommended");
  if (starred) return Math.max(1, starred.basesDestroyed);

  const sensible = candidates.filter((c) => stanceOf(c.option) !== "discouraged");
  const reach = Math.max(1, ...(sensible.length > 0 ? sensible : candidates).map((c) => c.basesDestroyed));
  return Math.min(baseCount, reach);
}

/**
 * The loadout to show for the number of bases asked for.
 *
 * Among those that do the job, the source's own pick wins, then the best reward
 * multiplier — lighter loadouts earn more per base, so carrying more than the job
 * needs costs research. A loadout the author argues against is taken only when
 * nothing else reaches the target, which happens when the player deliberately
 * asks for more bases than the sensible loadouts cover.
 */
export function pickLoadout<T extends Candidate>(candidates: T[], wanted: number): T {
  const capable = candidates.filter((c) => c.basesDestroyed >= wanted);
  const pool = capable.length > 0 ? capable : candidates;
  return pool.reduce((best, c) => (compare(c, best) > 0 ? c : best));
}
