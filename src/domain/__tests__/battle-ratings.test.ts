import { describe, expect, it } from "vitest";
import { battleRatingsOf, rankToBr } from "../../../scripts/battle-ratings/parse";

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
