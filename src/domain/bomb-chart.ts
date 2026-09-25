import type { Bomb } from "./types";

/**
 * Whether a bomb gets a row in the bomb chart at all.
 *
 * A rocket belongs in the table for its mass and TNT figures even before its
 * damage value is checked (see scripts/etl/rockets.ts). Everything else with
 * no damage value has nothing to show at all, so it stays out.
 */
export const inBombChart = (bomb: Pick<Bomb, "damageValue" | "kind">) =>
  bomb.damageValue !== null || bomb.kind === "ROCKET";
