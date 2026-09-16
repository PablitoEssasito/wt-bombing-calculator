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

/** How far a loadout's reach sits from the number of bases asked for. */
const overshoot = (c: Candidate, wanted: number) => Math.abs(c.basesDestroyed - wanted);

const refused = (c: Candidate) => Number(stanceOf(c.option) === "discouraged");
const starred = (c: Candidate) => Number(stanceOf(c.option) === "recommended");

/**
 * Positive when a is the better loadout to show for this target.
 *
 * The two halves of the source's opinion sit on either side of fit, which is why
 * they are weighed separately. A loadout the author refuses is last whatever it
 * reaches. The star, though, answers "what should I take?" — the very question
 * the default target is set from, so where the player has left the target alone
 * the starred loadout fits exactly and wins here anyway. Once they ask for fewer
 * bases they are asking something else, and answering that with a loadout built
 * for twice the work would leave the control doing nothing at all.
 */
function compare(a: Candidate, b: Candidate, wanted: number): number {
  return (
    refused(b) - refused(a) ||
    overshoot(b, wanted) - overshoot(a, wanted) ||
    starred(a) - starred(b) ||
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
  return pool.reduce((best, c) => (compare(c, best, wanted) > 0 ? c : best));
}
