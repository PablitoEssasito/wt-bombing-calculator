/**
 * Core constants reverse-engineered from LEGION's Loadouts spreadsheet.
 * See the README for how each value was derived and verified.
 */

/**
 * "Base bleed" factor, taken from cell B1 of the source spreadsheet.
 *
 * A bombing base in War Thunder finishes burning down on its own once roughly
 * 90% of its hitpoints are gone, so you never have to deliver the full amount.
 */
export const BASE_BLEED = 0.9018;

/** The six base hitpoint tiers the game uses, lowest BR bracket first. */
export const BASE_HP_TIERS = [4000, 6000, 10000, 16000, 22000, 25900] as const;

export type BaseHp = (typeof BASE_HP_TIERS)[number];

/**
 * Which base hitpoint tier a match uses, keyed by the match's battle rating.
 * Derived from the ▲/▼ bracket markers in the spreadsheet's nation tabs, whose
 * boundaries fall at 2.0/2.3, 3.3/3.7, 4.7/5.0, 6.3/6.7 and 7.7/8.0.
 */
export const BASE_HP_BRACKETS: readonly { maxBr: number; hp: BaseHp }[] = [
  { maxBr: 2.0, hp: 4000 },
  { maxBr: 3.3, hp: 6000 },
  { maxBr: 4.7, hp: 10000 },
  { maxBr: 6.3, hp: 16000 },
  { maxBr: 7.7, hp: 22000 },
  { maxBr: Infinity, hp: 25900 },
];

/** How far above its own BR a vehicle can be pulled into a match. */
export const MAX_UPTIER = 1.0;

export const NATIONS = [
  "usa",
  "germany",
  "ussr",
  "britain",
  "japan",
  "china",
  "italy",
  "france",
  "sweden",
  "israel",
] as const;

export type Nation = (typeof NATIONS)[number];

export const NATION_LABELS: Record<Nation, string> = {
  usa: "USA",
  germany: "Germany",
  ussr: "USSR",
  britain: "Great Britain",
  japan: "Japan",
  china: "China",
  italy: "Italy",
  france: "France",
  sweden: "Sweden",
  israel: "Israel",
};

/**
 * Reward-multiplier curve a vehicle sits on, from the trailing letter column of
 * the nation tabs: X / F / P / PF.
 */
export const VEHICLE_CATEGORIES = [
  "tt-bomber",
  "tt-fighter",
  "premium-bomber",
  "premium-fighter",
] as const;

export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  "tt-bomber": "Tech tree · bomber/attacker",
  "tt-fighter": "Tech tree · fighter",
  "premium-bomber": "Premium · bomber/attacker",
  "premium-fighter": "Premium · fighter",
};

export const GAME_MODES = ["rb", "ab"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Number of bombing bases on the map. Three-base maps do not respawn bases. */
export const BASE_COUNTS = [3, 4] as const;
export type BaseCount = (typeof BASE_COUNTS)[number];
