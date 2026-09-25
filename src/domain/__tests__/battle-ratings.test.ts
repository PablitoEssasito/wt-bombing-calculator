import { describe, expect, it } from "vitest";
import {
  battleRatingsOf,
  boosterValuesOf,
  economyOf,
  rankToBr,
  weaponDamageByFile,
} from "../../../scripts/battle-ratings/parse";

describe("boosterValuesOf", () => {
  it("lists each currency's personal booster sizes once, leaving squad boosters out", () => {
    const values = boosterValuesOf({
      a: { type: "rateBooster", rateBoosterParams: { wpRate: 20 } },
      b: { type: "rateBooster", rateBoosterParams: { wpRate: 10, xpRate: 10 } },
      c: { type: "rateBooster", rateBoosterParams: { wpRate: 20 } },
      squad: { type: "rateBooster", rateBoosterParams: { wpRate: 22, personal: false } },
      other: { type: "universalSpare" },
    });
    expect(values).toEqual({ sl: [10, 20], rp: [10] });
  });
});

describe("economyOf", () => {
  it("reads a gold tile's multipliers and the game's two premium tests (Su-25K)", () => {
    const economy = economyOf({
      rewardMulArcade: 1.75,
      rewardMulHistorical: 6.23,
      rewardMulSimulation: 12,
      expMul: 2.32,
      costGold: 9270,
      unitClass: "exp_assault",
    });
    expect(economy).toEqual({ sl: [1.75, 6.23, 12], rp: 2.32, special: true, goldPriced: true, fighter: false });
  });

  it("marks a pack aircraft special though it has no gold price, and a fighter as one", () => {
    const economy = economyOf({ premPackAir: true, unitClass: "exp_fighter" });
    expect(economy.special).toBe(true);
    expect(economy.goldPriced).toBe(false);
    expect(economy.fighter).toBe(true);
  });
});

describe("weaponDamageByFile", () => {
  it("matches the whole key, so a rack never lends its price to the bomb it carries", () => {
    const weapons: [string, { weaponDamage: number; isWeaponForCustomSlot: boolean }][] = [
      ["containers_ter_ar_inc_220", { weaponDamage: 32580, isWeaponForCustomSlot: true }],
      ["bombguns_ar_inc_220", { weaponDamage: 10860, isWeaponForCustomSlot: true }],
      ["containers_mbd2_67u_su_ofab_100_120_x4", { weaponDamage: 5787, isWeaponForCustomSlot: true }],
    ];
    expect(weaponDamageByFile(weapons, ["ar_inc_220", "ter_ar_inc_220", "mbd2_67u_su_ofab_100_120_x4", "su_r_60mk"])).toEqual({
      ar_inc_220: 10860,
      ter_ar_inc_220: 32580,
      mbd2_67u_su_ofab_100_120_x4: 5787,
    });
  });
});

describe("rankToBr", () => {
  it("turns the game's economic rank into a battle rating", () => {
    expect(rankToBr(0)).toBe(1);
    expect(rankToBr(1)).toBe(1.3);
    expect(rankToBr(2)).toBe(1.7);
    expect(rankToBr(28)).toBe(10.3);
  });
});

describe("battleRatingsOf", () => {
  it("leaves every ground mode empty for an aircraft ground battles don't take (B-18A)", () => {
    const ratings = battleRatingsOf({
      economicRankArcade: 1,
      economicRankHistorical: 1,
      economicRankSimulation: 2,
      economicRank: 2,
    });
    expect(ratings).toEqual({ air: [1.3, 1.3, 1.7], ground: [null, null, null] });
  });

  it("reads each ground mode on its own, as the wiki shows them (Su-25: — / 9.7 / 9.7)", () => {
    const ratings = battleRatingsOf({
      economicRankArcade: 29,
      economicRankHistorical: 28,
      economicRankSimulation: 29,
      economicRankTankHistorical: 26,
      economicRankTankSimulation: 26,
    });
    expect(ratings).toEqual({ air: [10.7, 10.3, 10.7], ground: [null, 9.7, 9.7] });
  });
});
