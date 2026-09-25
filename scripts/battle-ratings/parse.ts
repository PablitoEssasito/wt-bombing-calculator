import type { BattleRatings } from "../../src/domain/types";
import type { AircraftEconomy, RewardConstants } from "../../src/domain/reward";

/** One unit's entry in the game's `wpcost.blkx` — only the fields read here. */
export type UnitCost = Partial<Record<`economicRank${string}`, number>> & {
  rewardMulArcade?: number;
  rewardMulHistorical?: number;
  rewardMulSimulation?: number;
  expMul?: number;
  costGold?: number;
  premPackAir?: boolean;
  unitClass?: string;
  rank?: number;
};

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

/**
 * What an aircraft earns with, as the game prices it. "Special" is the game's
 * own test for the gold tiles (`isUnitSpecial` in ranks_common_shared.nut) —
 * bought with Golden Eagles or sold in a pack — which is what doubles its
 * Silver Lions; the preset bonus asks only whether it has a gold price at all
 * (`getPresetRewardMul`, econWeaponUtils.nut), so the two are kept apart.
 */
export function economyOf(cost: UnitCost): AircraftEconomy {
  return {
    sl: [cost.rewardMulArcade ?? 1, cost.rewardMulHistorical ?? 1, cost.rewardMulSimulation ?? 1],
    rp: cost.expMul ?? 1,
    special: (cost.costGold ?? 0) > 0 || cost.premPackAir === true,
    goldPriced: cost.costGold !== undefined,
    fighter: cost.unitClass === "exp_fighter",
  };
}

type Blk = Record<string, unknown>;

/**
 * The game-wide constants the reward screens are computed from, out of
 * `warpoints.blkx` and `rank.blkx`. A missing value fails loudly: silently
 * falling back would publish a wrong multiplier on every aircraft at once.
 */
export function rewardConstantsOf(warpoints: Blk, ranks: Blk, items: Blk): RewardConstants {
  const number = (value: unknown, name: string): number => {
    if (typeof value !== "number") throw new Error(`reward constants: ${name} missing`);
    return value;
  };
  const bombing = warpoints.BombingRewardMultipliers as Blk | undefined;
  const visual = warpoints.rewardMulVisual as Blk | undefined;
  const table = (bombing?.piecewiseLinearTable as Blk | undefined)?.v;
  if (!bombing || !visual || !Array.isArray(table)) throw new Error("reward constants: BombingRewardMultipliers missing");
  return {
    bombing: {
      presetDmgMin: number(bombing.presetDmgMin, "presetDmgMin"),
      presetDmgMax: number(bombing.presetDmgMax, "presetDmgMax"),
      bombingRewardModifier: number(bombing.bombingRewardModifier, "bombingRewardModifier"),
      fighterBombingRewardMul: number(bombing.fighterBombingRewardMul, "fighterBombingRewardMul"),
      premBombingRewardMul: number(bombing.premBombingRewardMul, "premBombingRewardMul"),
      table: table as [number, number][],
    },
    visual: [
      number(visual.rewardMulVisualArcade, "rewardMulVisualArcade"),
      number(visual.rewardMulVisualHistorical, "rewardMulVisualHistorical"),
      number(visual.rewardMulVisualSimulation, "rewardMulVisualSimulation"),
    ],
    specialPart: number(visual.premRewardMulVisualPart, "premRewardMulVisualPart"),
    premiumAccount: {
      sl: number(warpoints.wpMultiplier, "wpMultiplier"),
      rp: number(ranks.xpMultiplier, "xpMultiplier"),
    },
    talisman: number(ranks.goldPlaneExpMul, "goldPlaneExpMul"),
    boosters: boosterValuesOf(items),
  };
}

/**
 * Every percentage a personal booster comes in, per currency (`wpRate` for
 * Silver Lions, `xpRate` for research points). Squad boosters are left out:
 * the game stacks those apart from the player's own (`getBoostersEffects`).
 */
export function boosterValuesOf(items: Blk): { sl: number[]; rp: number[] } {
  const sl = new Set<number>();
  const rp = new Set<number>();
  for (const item of Object.values(items)) {
    const entry = item as { type?: string; rateBoosterParams?: { wpRate?: number; xpRate?: number; personal?: boolean } };
    if (entry?.type !== "rateBooster") continue;
    const params = entry.rateBoosterParams ?? {};
    if (params.personal === false) continue;
    if (params.wpRate) sl.add(params.wpRate);
    if (params.xpRate) rp.add(params.xpRate);
  }
  const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b);
  return { sl: sorted(sl), rp: sorted(rp) };
}

/** The weapon kinds the game prefixes a custom-slot weapon's key with. */
const WEAPON_KINDS = ["bombguns", "rocketguns", "containers", "drop_tank", "torpedoes", "mines", "payloadguns", "equipment", "weapons"];

/**
 * Damage the game prices each custom-slot weapon at, by the weapon file the
 * armament data names its stores after. The game keys them `<kind>_<file>`
 * (`bombguns_su_ofab250`), and a weapon is priced the same on every aircraft
 * that hangs it, so one table serves them all.
 *
 * Matched on the whole key, not its ending: `containers_ter_ar_inc_220` is a
 * triple rack of the `bombguns_ar_inc_220` bomb, priced three times over, and
 * its file is `ter_ar_inc_220` — a suffix match would hand the rack's price to
 * the lone bomb. Weapons carrying no damage (guns, fuel, most missiles) are left
 * out, which is what the game counts them as.
 */
export function weaponDamageByFile(
  weapons: Iterable<[string, { weaponDamage?: number; isWeaponForCustomSlot?: boolean }]>,
  files: string[],
): Record<string, number> {
  const byKey = new Map<string, number>();
  for (const [key, weapon] of weapons) {
    if (weapon.isWeaponForCustomSlot && typeof weapon.weaponDamage === "number") byKey.set(key, weapon.weaponDamage);
  }
  const damage: Record<string, number> = {};
  for (const file of new Set(files)) {
    for (const key of [file, ...WEAPON_KINDS.map((kind) => `${kind}_${file}`)]) {
      const value = byKey.get(key);
      if (value !== undefined) {
        damage[file] = value;
        break;
      }
    }
  }
  return damage;
}
