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

/**
 * Three-base maps set their own base hitpoints, by the battle's balance level —
 * whose steps fall on the same BR brackets — and their own arcade multiplier:
 * `destroy_bomb_areas_template.blk` (mis.vromfs.bin_u › gamedata/missions/templates),
 * which Kursk, Norway and the other three-zone missions import. Keyed here by
 * the four-base tier of the same bracket.
 */
export const THREE_BASE_HP: Record<BaseHp, { hp: number; arcadeMul: number }> = {
  4000: { hp: 6000, arcadeMul: 2.5 },
  6000: { hp: 8000, arcadeMul: 3.2 },
  10000: { hp: 10000, arcadeMul: 3.2 },
  16000: { hp: 12000, arcadeMul: 4.2 },
  22000: { hp: 12000, arcadeMul: 4.2 },
  25900: { hp: 12000, arcadeMul: 4.2 },
};

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

/**
 * The wiki's own aircraft class — fighter, bomber, or strike aircraft — the
 * same grouping the game's tech tree filters by. Independent of `category`
 * above: that axis is premium-vs-researched and reward curve, this one is
 * what the aircraft actually is.
 */
export const VEHICLE_TYPES = ["fighter", "bomber", "assault"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** The wiki's own colour for each class — the diamond it marks a unit row with. */
export const VEHICLE_TYPE_COLORS: Record<VehicleType, string> = {
  fighter: "#ffac6f",
  bomber: "#a3b1ff",
  assault: "#bde9b5",
};

export const GAME_MODES = ["rb", "ab"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Number of bombing bases on the map. Three-base maps do not respawn bases. */
export const BASE_COUNTS = [3, 4] as const;
export type BaseCount = (typeof BASE_COUNTS)[number];
