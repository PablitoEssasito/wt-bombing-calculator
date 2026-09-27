import type { Bomb, BombKind } from "./types";

/**
 * Whether a bomb gets a row in the bomb chart at all.
 *
 * A rocket belongs in the table for its mass and TNT figures even before its
 * damage value is checked (see scripts/etl/rockets.ts). Everything else with
 * no damage value has nothing to show at all, so it stays out.
 */
export const inBombChart = (bomb: Pick<Bomb, "damageValue" | "kind">) =>
  bomb.damageValue !== null || bomb.kind === "ROCKET";

/**
 * Every kind a bomb is filtered under: its seeker's, and satellite guidance's
 * too where it flies on satellite-aided INS — a Paveway IV is laser-guided and
 * a GNSS bomb both.
 */
export const kindsOf = (bomb: Pick<Bomb, "kind" | "navigation">): BombKind[] =>
  bomb.navigation === "INS/GNSS" && bomb.kind !== "GNSS" ? [bomb.kind, "GNSS"] : [bomb.kind];
