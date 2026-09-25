/**
 * Rewards as the game itself computes them. Every function here is a port of
 * the game's own UI scripts (gui.vromfs.bin_u in the datamine), with the
 * constants read out of its config files by scripts/battle-ratings — so the
 * numbers match the client's screens rather than approximating them.
 */

import type { LoadoutOption } from "./types";

/** Air AB / RB / SB, in that order, as the game's per-mode figures are. */
export type ModeTriple = [number, number, number];

/** An aircraft's earning figures, from `wpcost.blkx`. */
export type AircraftEconomy = {
  /** `rewardMulArcade/Historical/Simulation` — its Silver Lion multiplier per mode. */
  sl: ModeTriple;
  /** `expMul` — its research point multiplier. */
  rp: number;
  /**
   * The game's gold tiles (`isUnitSpecial`): bought with Golden Eagles or sold in
   * a pack. Its SL multiplier already holds a ×2, which the game shows apart.
   */
  special: boolean;
  /** Has a gold price at all — what the payload bonus asks (`getPresetRewardMul`). */
  goldPriced: boolean;
  /** `unitClass == exp_fighter`, which earns less for bombing. */
  fighter: boolean;
};

/** Game-wide constants, from `warpoints.blkx` and `rank.blkx`. */
export type RewardConstants = {
  bombing: {
    presetDmgMin: number;
    presetDmgMax: number;
    bombingRewardModifier: number;
    fighterBombingRewardMul: number;
    premBombingRewardMul: number;
    /** [damage, multiplier] points, for payloads past 200 000. */
    table: [number, number][];
  };
  /** `rewardMulVisual…` per mode. */
  visual: ModeTriple;
  /** `premRewardMulVisualPart` — the share of a gold tile's SL multiplier shown as its ×2. */
  specialPart: number;
  /** `wpMultiplier` / `xpMultiplier`: what a premium account multiplies by. */
  premiumAccount: { sl: number; rp: number };
  /** `goldPlaneExpMul`: a talisman's research point multiplier. */
  talisman: number;
  /** Every percentage a personal booster comes in, per currency, from `items.blkx`. */
  boosters: { sl: number[]; rp: number[] };
};

/** `interpolateArray` (std/math.nut): linear between points, held flat past either end. */
function interpolate(points: [number, number][], value: number): number {
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (value <= x || i === points.length - 1) return y;
    const [nextX, nextY] = points[i + 1];
    if (value > nextX) continue;
    return y + ((nextY - y) * (value - x)) / (nextX - x);
  }
  return 0;
}

/**
 * `getPresetRewardMul` (globals/econWeaponUtils.nut): how much of the base
 * reward a payload of this much damage earns, 1 at most.
 *
 * Past presetDmgMin the multiplier falls as the payload grows, so a heavier
 * load can't flatten bases for the same pay as a light one flattens them.
 * Gold-priced aircraft get a bonus before the cap; fighters a cut after it.
 * Payloads past 200 000 (nuclear bombs) read a table instead.
 */
export function presetRewardMul(
  weaponDamage: number,
  unit: Pick<AircraftEconomy, "goldPriced" | "fighter">,
  constants: RewardConstants["bombing"],
): number {
  if (weaponDamage <= 0) return 1;
  if (weaponDamage >= 200000) return interpolate(constants.table, weaponDamage);

  const { presetDmgMin, presetDmgMax, bombingRewardModifier } = constants;
  const scale = 1 + ((bombingRewardModifier - 1) * (weaponDamage - presetDmgMin)) / (presetDmgMax - presetDmgMin);
  let mul = (scale * presetDmgMin) / weaponDamage;
  if (unit.goldPriced) mul *= constants.premBombingRewardMul;
  mul = Math.min(mul, 1);
  if (unit.fighter) mul *= constants.fighterBombingRewardMul;
  return mul;
}

/** `UI_BASE_REWARD_DECORATION` (weaponryTooltipPkg.nut): the loadout screen shows the multiplier ×10. */
const SHOWN_AS = 10;

/** The "reward multiplier for bases" the loadout screen shows, to one decimal. */
export function rewardMultiplier(
  weaponDamage: number,
  unit: Pick<AircraftEconomy, "goldPriced" | "fighter">,
  constants: RewardConstants["bombing"],
): number {
  return Math.round(presetRewardMul(weaponDamage, unit, constants) * SHOWN_AS * 10) / 10;
}

/**
 * `presetRewardMul` for one of the sheet's loadouts, over the damage of every
 * bomb it carries — or null where that can't be had: a bomb the chart doesn't
 * price, or bases the sheet only counts ("+ 2") and whose bombs it never lists.
 */
export function loadoutRewardMul(
  option: LoadoutOption,
  damageOf: (bombId: string) => number | null | undefined,
  unit: Pick<AircraftEconomy, "goldPriced" | "fighter">,
  constants: RewardConstants["bombing"],
): number | null {
  const schedule = option.schedules[0];
  if (!schedule) return null;
  if (schedule.basesDestroyed !== null && schedule.basesDestroyed > schedule.bases.length) return null;
  let damage = 0;
  for (const item of schedule.bases.flatMap((base) => base.items)) {
    const value = damageOf(item.bombId);
    if (value === null || value === undefined) return null;
    damage += value * item.count;
  }
  return damage > 0 ? presetRewardMul(damage, unit, constants) : null;
}

/** `round_by_value` (dagor std): to the nearest step. */
const roundBy = (value: number, step: number) => Math.round(Math.floor(value / step + 0.5) * step * 100) / 100;

/**
 * `calc_public_boost` (globals/ranks_common_shared.nut): boosters of one
 * currency, strongest first, each counting less than the one before — the
 * second 60%, the third 40%, and so on — to a whole percent.
 */
export function boosterBonus(percents: readonly number[]): number {
  const weights = [1, 0.6, 0.4, 0.2, 0.1];
  const last = weights[weights.length - 1];
  const sorted = [...percents].sort((a, b) => b - a);
  let total = 0;
  sorted.forEach((percent, i) => {
    if (i < weights.length) total += weights[i] * percent;
    else total += last * percent > 1 ? last * percent : 1;
  });
  return Math.round(total);
}

/**
 * What a base pays in Air RB per hitpoint, before the aircraft's multiplier,
 * the payload's, the premium account and boosters. No game file states it:
 * it's fitted to the rewards the HUD announced in real battles
 * (scripts/reward-logs).
 *
 * A base pays twice: for the damage dealt to it, shared by everyone who hit
 * it, and once more for destroying it — 4/7 of the damage figure in Silver
 * Lions, half of it in research points. Both scale with the base's hitpoints:
 * one figure per hitpoint lands every clean Silver Lion sample on the lion —
 * Su-25K, F-5C, Su-17M4 and F-4J against 25 900 HP bases, the A-26B-10 against
 * 16 000 and three-base maps' 12 000 HP ones, with and without boosters — all
 * but the B-25J-30 (see TODOBYDEV). Research points are looser: about 6%
 * either way from battle to battle, and the rougher of the two.
 *
 * The research figure is fitted to tech-tree aircraft without a talisman —
 * the Su-17M4, A-26B-10 and B-25J-30 agree on it within 0.2%, and the F-4J
 * with a talisman lands on it too (see `RewardLine.exact`).
 */
export const BASE_REWARD_PER_HP = {
  sl: (2039.9 / 25900) * (1 + 4 / 7),
  rp: (372.5 / 25900) * (1 + 1 / 2),
};

/**
 * What a gold tile's research points take on top of its talisman in battle,
 * which no file explains. Fitted: the Su-25K and F-5C land 5% above a
 * tech-tree aircraft with a talisman (the F-4J).
 */
const GOLD_TILE_RP = 1.05;

/**
 * What a sortie flattening `bases` bases of `baseHp` hitpoints pays, in Air
 * RB. `payload` is `presetRewardMul` (0–1); `lines` are the aircraft's reward
 * lines for Air RB with the player's own setup, whose unrounded totals the
 * server pays by.
 */
export function sortieReward(
  bases: number,
  baseHp: number,
  payload: number,
  lines: { sl: RewardLine; rp: RewardLine },
): { sl: number; rp: number } {
  const perBase = baseHp * payload;
  return {
    sl: Math.round(bases * BASE_REWARD_PER_HP.sl * perBase * lines.sl.exact),
    rp: Math.round(bases * BASE_REWARD_PER_HP.rp * perBase * lines.rp.exact),
  };
}

/** What the player brings to a sortie on top of the aircraft. */
export type RewardSetup = {
  premiumAccount: boolean;
  /** Only asked of a tech-tree aircraft; a gold tile always has one. */
  talisman: boolean;
  /** Active boosters, in percent, per currency. */
  boostersSl: readonly number[];
  boostersRp: readonly number[];
};

/** One currency's line in the aircraft's reward panel, split the way the game splits it. */
export type RewardLine = {
  /** The aircraft's own multiplier, as the game shows it. */
  multiplier: number;
  /** A gold tile's ×2 on Silver Lions; 1 otherwise. */
  special: number;
  /** Premium account, talisman and boosters, as fractions added to the base 1. */
  premiumAccount: number;
  talisman: number;
  booster: number;
  /** The whole, as the game's "Reward N%" (1 = 100%). */
  total: number;
  /**
   * What a battle actually pays by: the same from the unrounded multiplier,
   * except that in battle the premium account's research bonus counts the
   * talisman's share too — the battle results itemise an F-4J's base as
   * 254 + (PA) 508 + (Talismans) 254, so ×4 where the card sums ×3 — while a
   * booster counts the base alone (a B-25J-30's 113 + (PA) 113 + (Booster) 12
   * at +10%), and a gold tile's take `GOLD_TILE_RP` more.
   */
  exact: number;
};

/**
 * The aircraft screen's "Reward" lines (scripts/airInfo.nut and
 * unit.nut › getWpRewardMulList):
 *
 *   RP = expMul × (100% + premium account + talisman + boosters)
 *   SL = multiplier [× 2.0 for a gold tile] × (100% + premium account + boosters)
 *
 * Premium account and talisman are additions, not multipliers of each other.
 */
export function rewardLines(
  unit: AircraftEconomy,
  mode: 0 | 1 | 2,
  setup: RewardSetup,
  constants: RewardConstants,
): { sl: RewardLine; rp: RewardLine } {
  const specialPart = unit.special ? constants.specialPart : 0;
  const rawSl = unit.sl[mode] * constants.visual[mode];
  const slMultiplier = roundBy(rawSl * (1 - specialPart), unit.special ? 0.05 : 0.1);
  const special = roundBy(1 / (1 - specialPart), 0.1);

  const slBonus = {
    premiumAccount: setup.premiumAccount ? constants.premiumAccount.sl - 1 : 0,
    talisman: 0,
    booster: boosterBonus(setup.boostersSl) / 100,
  };
  const rpBonus = {
    premiumAccount: setup.premiumAccount ? constants.premiumAccount.rp - 1 : 0,
    talisman: unit.special || setup.talisman ? constants.talisman - 1 : 0,
    booster: boosterBonus(setup.boostersRp) / 100,
  };
  const sum = (b: typeof slBonus) => 1 + b.premiumAccount + b.talisman + b.booster;

  return {
    sl: {
      multiplier: slMultiplier,
      special,
      ...slBonus,
      total: slMultiplier * special * sum(slBonus),
      exact: rawSl * sum(slBonus),
    },
    rp: {
      multiplier: unit.rp,
      special: 1,
      ...rpBonus,
      total: unit.rp * sum(rpBonus),
      exact:
        unit.rp *
        ((1 + rpBonus.premiumAccount) * (1 + rpBonus.talisman) + rpBonus.booster) *
        (unit.special ? GOLD_TILE_RP : 1),
    },
  };
}
