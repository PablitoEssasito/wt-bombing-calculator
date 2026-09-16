import {
  BASE_BLEED,
  BASE_HP_BRACKETS,
  BASE_HP_TIERS,
  MAX_UPTIER,
  type BaseCount,
  type BaseHp,
  type GameMode,
} from "./constants";

/** The base hitpoint tier used by a match at the given battle rating. */
export function baseHpForBr(br: number): BaseHp {
  const bracket = BASE_HP_BRACKETS.find((b) => br <= b.maxBr);
  // The last bracket is unbounded, so the fallback is only for the type checker.
  return bracket ? bracket.hp : 25900;
}

/**
 * Every base hitpoint tier a vehicle can actually run into, from a full downtier
 * at its own BR up to a full uptier. Ordered lowest first.
 */
export function reachableBaseHps(vehicleBr: number): BaseHp[] {
  const lowest = BASE_HP_TIERS.indexOf(baseHpForBr(vehicleBr));
  const highest = BASE_HP_TIERS.indexOf(baseHpForBr(vehicleBr + MAX_UPTIER));
  return BASE_HP_TIERS.slice(lowest, highest + 1) as BaseHp[];
}

/**
 * Effective hitpoints of a single base once game mode and map size are taken
 * into account.
 *
 * Arcade bases carry double health, and three-base maps take roughly half the
 * payload — both rules come from the Home and FAQ tabs of the source
 * spreadsheet, and both are applied as independent multipliers.
 */
export function effectiveBaseHp(
  baseHp: BaseHp,
  mode: GameMode,
  baseCount: BaseCount,
): number {
  const modeFactor = mode === "ab" ? 2 : 1;
  const mapFactor = baseCount === 3 ? 0.5 : 1;
  return baseHp * modeFactor * mapFactor;
}

/** How many of one bomb it takes to flatten a base of the given hitpoints. */
export function bombsNeeded(effectiveHp: number, damageValue: number): number {
  if (damageValue <= 0) return Infinity;
  return Math.ceil((effectiveHp * BASE_BLEED) / damageValue);
}
