import { describe, expect, it } from "vitest";
import bombData from "../../data/bombs.json";
import { NATIONS } from "../constants";
import type { Bomb } from "../types";

const bombs = bombData as Bomb[];
const byChartName = (name: string) => bombs.find((b) => b.chartName === name)!;

/**
 * `usedByNations` (scripts/armament/index.ts, `usedByNationsOf`) is what the
 * bomb chart's nation filter actually reads — not the chart's own `nation`
 * column, which names only whichever nation's block a bomb was first
 * catalogued under. These pin the two failure modes that column has: rockets,
 * which the sheet never priced and so never carries a nation for at all, and
 * ordinary bombs shared across nations through lend-lease and licence-built
 * aircraft that a single column can't represent.
 */
describe("bombs.json: usedByNations", () => {
  it("gives a rocket real nation coverage, even though the chart's own column is null", () => {
    const hvar = byChartName("HVAR");
    expect(hvar.nation).toBeNull();
    expect(hvar.usedByNations.length).toBeGreaterThan(1);
    expect(hvar.usedByNations).toContain("usa");
  });

  it("carries a bomb's cataloguing nation as one of the nations that use it", () => {
    // AN-M30A1 is catalogued under the USA block, and the USA does fly it —
    // the derived field has to agree with the chart on this much.
    const bomb = byChartName("AN-M30A1");
    expect(bomb.nation).toBe("usa");
    expect(bomb.usedByNations).toContain("usa");
  });

  it("shares a widely-used bomb across more nations than the chart alone names", () => {
    // Copy-paste and licence-built aircraft carry USA ordnance well past the
    // USA block it was catalogued under.
    const bomb = byChartName("AN-M30A1");
    expect(bomb.usedByNations.length).toBeGreaterThan(1);
  });

  it("names only real nations, in the app's own NATIONS order", () => {
    for (const bomb of bombs) {
      for (const nation of bomb.usedByNations) expect(NATIONS).toContain(nation);
      const sorted = [...bomb.usedByNations].sort(
        (a, b) => NATIONS.indexOf(a) - NATIONS.indexOf(b),
      );
      expect(bomb.usedByNations).toEqual(sorted);
    }
  });

  it("leaves almost nothing without a nation — a regression would hide it from every specific filter", () => {
    // Every priced/rocket entry should match at least one nation via either
    // the sheet's schedules or the game's own hardpoints; only a genuine
    // datamine dead-end (an unused duplicate rocket spelling) should slip
    // through both. Before both sources were unioned, this was 214/348.
    const withoutNation = bombs.filter((b) => b.usedByNations.length === 0);
    expect(withoutNation.length).toBeLessThan(5);
  });
});
