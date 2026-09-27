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
 * too where it flies on satellite-aided INS ("laser+IOG+GNSS") — a Paveway IV
 * is laser-guided and a GNSS bomb both.
 */
export const kindsOf = (bomb: Pick<Bomb, "kind" | "guidance">): BombKind[] =>
  bomb.guidance?.includes("+GNSS") && bomb.kind !== "GNSS" ? [bomb.kind, "GNSS"] : [bomb.kind];

/**
 * What a bomb counts for in the bombing reward: the game pays by its own
 * price (`weaponDamage`), and prices nothing it gives no figure for — so an
 * estimate from its explosion model, however well it predicts what the blast
 * does to a base, adds nothing to the reward multiplier.
 */
export const rewardDamageOf = (bomb: Pick<Bomb, "damageValue" | "damageSource">): number | null =>
  bomb.damageSource === "estimate" ? 0 : bomb.damageValue;
