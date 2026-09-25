import { describe, expect, it } from "vitest";
import aircraft from "../../data/aircraft.json";
import bombs from "../../data/bombs.json";
import economyData from "../../data/economy.json";
import constantsData from "../../data/reward-constants.json";
import {
  boosterBonus,
  loadoutRewardMul,
  presetRewardMul,
  rewardLines,
  rewardMultiplier,
  sortieReward,
  type AircraftEconomy,
  type RewardConstants,
} from "../reward";
import type { Aircraft, Bomb } from "../types";

const constants = constantsData as unknown as RewardConstants;
const economy = economyData.aircraft as unknown as Record<string, AircraftEconomy>;
const byId = new Map((bombs as Bomb[]).map((b) => [b.id, b]));

const TECH_TREE = { goldPriced: false, fighter: false };
const TECH_FIGHTER = { goldPriced: false, fighter: true };
const GOLD = { goldPriced: true, fighter: false };

describe("presetRewardMul (econWeaponUtils.nut)", () => {
  it("pays the whole reward up to presetDmgMin", () => {
    expect(presetRewardMul(10000, TECH_TREE, constants.bombing)).toBe(1);
    expect(presetRewardMul(18000, TECH_TREE, constants.bombing)).toBe(1);
  });

  it("falls past it, to half at presetDmgMax times the modifier", () => {
    // 97 500: scale 2, so 2 × 18 000 / 97 500.
    expect(presetRewardMul(97500, TECH_TREE, constants.bombing)).toBeCloseTo(36000 / 97500, 10);
  });

  it("gives gold-priced aircraft their bonus before the cap, fighters their cut after it", () => {
    const damage = 40000;
    const base = presetRewardMul(damage, TECH_TREE, constants.bombing);
    expect(presetRewardMul(damage, GOLD, constants.bombing)).toBeCloseTo(Math.min(base * 1.2, 1), 10);
    expect(presetRewardMul(damage, TECH_FIGHTER, constants.bombing)).toBeCloseTo(base * 0.8, 10);
    expect(presetRewardMul(10000, { goldPriced: true, fighter: true }, constants.bombing)).toBe(0.8);
  });

  it("reads the table for nuclear-sized payloads", () => {
    expect(presetRewardMul(200000, TECH_TREE, constants.bombing)).toBe(0.3);
    expect(presetRewardMul(700000, TECH_TREE, constants.bombing)).toBeCloseTo(0.235, 10);
    expect(presetRewardMul(1e9, TECH_TREE, constants.bombing)).toBe(0.017);
  });
});

describe("rewardMultiplier", () => {
  it("shows the multiplier ×10, as the loadout screen does", () => {
    expect(rewardMultiplier(10000, TECH_TREE, constants.bombing)).toBe(10);
    expect(rewardMultiplier(10000, TECH_FIGHTER, constants.bombing)).toBe(8);
  });

  it("lands on the sheet's own multipliers for most of the loadouts it prices", () => {
    // A sanity check, not the reference: the game's own formula is ported
    // exactly above. The sheet prices the whole preset, rockets and all, while
    // a schedule only lists what gets dropped, and some of its figures predate
    // the game's current damage values (A-4B, Mk 77 preset: the game's
    // weaponDamage of 76 020 gives 4.1, the sheet still says 3.8).
    let total = 0;
    let close = 0;
    for (const plane of aircraft as Aircraft[]) {
      const unit = economy[plane.id];
      if (!unit) continue;
      for (const option of plane.options) {
        if (option.rewardMultiplier === null) continue;
        const items = option.schedules[0].bases.flatMap((b) => b.items);
        const damage = items.reduce((sum, it) => sum + (byId.get(it.bombId)?.damageValue ?? NaN) * it.count, 0);
        if (!(damage > 0)) continue;
        total++;
        if (Math.abs(rewardMultiplier(damage, unit, constants.bombing) - option.rewardMultiplier) <= 0.11) close++;
      }
    }
    expect(close / total).toBeGreaterThan(0.85);
  });
});

describe("loadoutRewardMul", () => {
  const plane = (id: string) => (aircraft as Aircraft[]).find((p) => p.id === id)!;
  const damageOf = (id: string) => byId.get(id)?.damageValue;

  it("prices a sheet loadout the way the game does, not the way the sheet does", () => {
    // 12 × Mk 82: the sheet says 6.6; a real battle paid 5.6.
    const f4j = plane("usa-f-4j").options[3];
    expect(f4j.rewardMultiplier).toBe(6.6);
    expect(loadoutRewardMul(f4j, damageOf, economy["usa-f-4j"], constants.bombing)! * 10).toBeCloseTo(5.58, 2);
    // The sheet files the Chinese B-25J-30 as a fighter (capped at 8); the game doesn't.
    const b25 = plane("china-b-25j-30").options[0];
    expect(b25.rewardMultiplier).toBe(8);
    expect(loadoutRewardMul(b25, damageOf, economy["china-b-25j-30"], constants.bombing)).toBe(1);
  });

  it("gives up on bases the sheet only counts, whose bombs it never lists", () => {
    const ju88 = plane("germany-ju-88-a-1").options[0];
    expect(loadoutRewardMul(ju88, damageOf, economy["germany-ju-88-a-1"], constants.bombing)).toBeNull();
  });
});

describe("boosterBonus (calc_public_boost)", () => {
  it("counts each further booster of a currency for less", () => {
    expect(boosterBonus([])).toBe(0);
    expect(boosterBonus([20])).toBe(20);
    expect(boosterBonus([20, 20])).toBe(32);
    expect(boosterBonus([20, 20, 20])).toBe(40);
    expect(boosterBonus([10, 50])).toBe(56);
  });
});

describe("sortieReward", () => {
  // Real Air RB battles, premium account on, no booster (scripts/reward-logs):
  // what one base paid for damage plus for its destruction.
  const premiumOnly = { premiumAccount: true, talisman: false, boostersSl: [], boostersRp: [] };

  it("matches the Su-25K with 4 × ZB-500 (custom preset) to the lion: 11 332 + 6 474 SL", () => {
    const unit = economy["ussr-su-25k"];
    const payload = presetRewardMul(4 * 12943, unit, constants.bombing);
    const { sl, rp } = sortieReward(1, 25900, payload, rewardLines(unit, 1, premiumOnly, constants));
    // The game rounds each payout on its own, so a lion or two either way.
    expect(Math.abs(sl - (11332 + 6474))).toBeLessThanOrEqual(2);
    // 2 163 + 1 080 in the commonest battle; others ran up to 6% either way.
    expect(Math.abs(rp - (2163 + 1080)) / (2163 + 1080)).toBeLessThan(0.01);
  });

  it("matches the F-5C with 4 × BLU-1 to the lion: 9 953 + 5 687 SL", () => {
    const unit = { sl: [3.21, 6.84, 12] as [number, number, number], rp: 2.32, special: true, goldPriced: true, fighter: true };
    const payload = presetRewardMul(4 * 12943, unit, constants.bombing);
    const { sl } = sortieReward(1, 25900, payload, rewardLines(unit, 1, premiumOnly, constants));
    expect(Math.abs(sl - (9953 + 5687))).toBeLessThanOrEqual(2);
  });

  it("scales with the base's hitpoints: the A-26B-10 against 16 000 HP bases, 1 970 + 1 127 SL", () => {
    const unit = economy["usa-a-26b-10"];
    const payload = presetRewardMul(30600, unit, constants.bombing);
    const { sl, rp } = sortieReward(1, 16000, payload, rewardLines(unit, 1, premiumOnly, constants));
    expect(Math.abs(sl - (1970 + 1127))).toBeLessThanOrEqual(3);
    // No talisman: 502 + 250 in the logs.
    expect(Math.abs(rp - (502 + 250)) / (502 + 250)).toBeLessThan(0.02);
  });

  it("stacks two SL boosters and adds an RP one to the base alone: the A-26B-10, +75% +20% SL, +50% RP", () => {
    const unit = economy["usa-a-26b-10"];
    const payload = presetRewardMul(30600, unit, constants.bombing);
    const setup = { ...premiumOnly, boostersSl: [75, 20], boostersRp: [50] };
    const { sl, rp } = sortieReward(1, 16000, payload, rewardLines(unit, 1, setup, constants));
    // Mozdok at BR 6.0, one base flattened alone: 1 190 + 1 923 + 1 781 SL, 240 + 388 + 313 RP.
    expect(Math.abs(sl - (1190 + 1923 + 1781))).toBeLessThanOrEqual(3);
    expect(Math.abs(rp - (240 + 388 + 313)) / (240 + 388 + 313)).toBeLessThan(0.01);
  });

  it("matches a tech-tree aircraft at high BR: the Su-17M4, 4 × ZB-500, 20% SL booster", () => {
    const unit = economy["ussr-su-17m4"];
    const payload = presetRewardMul(4 * 12943, unit, constants.bombing);
    const setup = { ...premiumOnly, boostersSl: [20] };
    const { sl, rp } = sortieReward(1, 25900, payload, rewardLines(unit, 1, setup, constants));
    // Two bases, each 5 599 + 3 200 SL and 902 + 450 RP.
    expect(Math.abs(sl - (5599 + 3200))).toBeLessThanOrEqual(2);
    expect(Math.abs(rp - (902 + 450)) / (902 + 450)).toBeLessThan(0.02);
  });

  it("doubles a tech-tree aircraft's research points with a talisman: the F-4J, 12 × Mk 82, 20% SL booster", () => {
    const unit = economy["usa-f-4j"];
    const payload = presetRewardMul(12 * 2464, unit, constants.bombing);
    const setup = { ...premiumOnly, talisman: true, boostersSl: [20] };
    const { sl, rp } = sortieReward(1, 25900, payload, rewardLines(unit, 1, setup, constants));
    // 582 + 5 532 + 3 494 SL and 192 + 1 836 + 1 016 RP.
    expect(Math.abs(sl - (582 + 5532 + 3494))).toBeLessThanOrEqual(2);
    expect(Math.abs(rp - (192 + 1836 + 1016)) / (192 + 1836 + 1016)).toBeLessThan(0.02);
  });

  it("adds a research booster to the base alone: the B-25J-30 at Tunisia, +10% RP (10 000 HP)", () => {
    const unit = economy["china-b-25j-30"];
    const payload = presetRewardMul(17367, unit, constants.bombing);
    const setup = { ...premiumOnly, boostersSl: [20], boostersRp: [10] };
    const { rp } = sortieReward(1, 10000, payload, rewardLines(unit, 1, setup, constants));
    // One base flattened alone: 238 + 173 for damage, 206 for destroying it,
    // itemised as 113 + (PA) 113 + (Booster) 12 and so on.
    expect(Math.abs(rp - (238 + 173 + 206)) / (238 + 173 + 206)).toBeLessThan(0.02);
  });

  it("scales with the bases flattened and the boosters running", () => {
    const unit = economy["ussr-su-25k"];
    const payload = presetRewardMul(4 * 12943, unit, constants.bombing);
    const boosted = { ...premiumOnly, boostersSl: [20] };
    // A 20% booster: 12 845 + 7 338 in the logs.
    expect(Math.abs(sortieReward(1, 25900, payload, rewardLines(unit, 1, boosted, constants)).sl - (12845 + 7338))).toBeLessThanOrEqual(2);
    expect(Math.abs(sortieReward(2, 25900, payload, rewardLines(unit, 1, premiumOnly, constants)).sl - 2 * (11332 + 6474))).toBeLessThanOrEqual(4);
  });
});

describe("rewardLines (airInfo.nut)", () => {
  const withEverything = { premiumAccount: true, talisman: false, boostersSl: [20, 20], boostersRp: [] };

  it("matches the game's panel for a tech-tree aircraft (Su-17M4, Air RB)", () => {
    const { sl, rp } = rewardLines(economy["ussr-su-17m4"], 1, withEverything, constants);
    expect(sl.multiplier).toBe(3.3);
    expect(sl.special).toBe(1);
    expect(Math.round(sl.total * 100)).toBe(601);
    expect(rp.multiplier).toBe(2.44);
    expect(Math.round(rp.total * 100)).toBe(488);
  });

  it("matches it for a gold tile, whose talisman comes with it (Su-25K, Air RB)", () => {
    const { sl, rp } = rewardLines(economy["ussr-su-25k"], 1, withEverything, constants);
    expect(sl.multiplier).toBe(3.1);
    expect(sl.special).toBe(2);
    expect(Math.round(sl.total * 100)).toBe(1128);
    expect(rp.talisman).toBe(1);
    expect(Math.round(rp.total * 100)).toBe(696);
  });

  it("pays the talisman as a doubling in battle, not the card's +100%, and a gold tile 5% more", () => {
    const talisman = { premiumAccount: true, talisman: true, boostersSl: [], boostersRp: [] };
    const techTree = rewardLines(economy["ussr-su-17m4"], 1, talisman, constants).rp;
    expect(techTree.total).toBeCloseTo(2.44 * 3, 10);
    expect(techTree.exact).toBeCloseTo(2.44 * 2 * 2, 10);
    expect(rewardLines(economy["ussr-su-25k"], 1, talisman, constants).rp.exact).toBeCloseTo(2.32 * 2 * 2 * 1.05, 10);
  });

  it("leaves a research booster out of the premium account's and talisman's doubling", () => {
    const everything = { premiumAccount: true, talisman: true, boostersSl: [], boostersRp: [10] };
    expect(rewardLines(economy["ussr-su-17m4"], 1, everything, constants).rp.exact).toBeCloseTo(2.44 * (2 * 2 + 0.1), 10);
  });

  it("adds nothing without a premium account, talisman or boosters", () => {
    const bare = { premiumAccount: false, talisman: false, boostersSl: [], boostersRp: [] };
    const { sl, rp } = rewardLines(economy["ussr-su-17m4"], 1, bare, constants);
    expect(sl.total).toBeCloseTo(3.3, 10);
    expect(rp.total).toBeCloseTo(2.44, 10);
  });
});
