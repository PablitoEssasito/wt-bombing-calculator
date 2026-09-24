import type { BattleRatings } from "../../src/domain/types";

/** One unit's entry in the game's `wpcost.blkx` — only the fields read here. */
export type UnitCost = Partial<Record<`economicRank${string}`, number>>;

/** The game stores a battle rating as an economic rank: 0 is 1.0, and each step is a third. */
export const rankToBr = (rank: number) => Math.round((rank / 3 + 1) * 10) / 10;

const AIR = ["Arcade", "Historical", "Simulation"] as const;
const GROUND = ["TankArcade", "TankHistorical", "TankSimulation"] as const;

/**
 * An aircraft's battle rating in every mode, AB/RB/SB for air and for ground
 * battles. A missing rank means the aircraft can't be flown in that mode: the
 * wiki shows "—" there. Most aircraft have no ground ranks at all.
 */
export function battleRatingsOf(cost: UnitCost): BattleRatings {
  const of = (modes: readonly string[]) =>
    modes.map((mode) => {
      const rank = cost[`economicRank${mode}`];
      return rank === undefined ? null : rankToBr(rank);
    }) as BattleRatings["air"];
  return { air: of(AIR), ground: of(GROUND) };
}
