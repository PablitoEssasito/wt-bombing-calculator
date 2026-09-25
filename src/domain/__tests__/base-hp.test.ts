import { describe, expect, it } from "vitest";
import bombs from "../../data/bombs.json";
import { baseHpForBr, bombsNeeded, effectiveBaseHp, reachableBaseHps } from "../base-hp";
import { BASE_HP_TIERS } from "../constants";
import type { Bomb } from "../types";

const chart = bombs as Bomb[];

describe("baseHpForBr", () => {
  it.each([
    [1.0, 4000],
    [2.0, 4000],
    [2.3, 6000],
    [3.3, 6000],
    [3.7, 10000],
    [4.7, 10000],
    [5.0, 16000],
    [6.3, 16000],
    [6.7, 22000],
    [7.7, 22000],
    [8.0, 25900],
    [14.0, 25900],
  ])("puts BR %s on a %s HP base", (br, hp) => {
    expect(baseHpForBr(br)).toBe(hp);
  });
});

describe("reachableBaseHps", () => {
  it("spans both tiers when a full uptier crosses a bracket boundary", () => {
    // A 4.3 aircraft sees matches from 4.3 to 5.3, straddling the 4.7/5.0 line.
    expect(reachableBaseHps(4.3)).toEqual([10000, 16000]);
  });

  it("stays on one tier when the whole uptier range sits inside a bracket", () => {
    expect(reachableBaseHps(6.7)).toEqual([22000]);
  });

  it("never runs past the top tier", () => {
    expect(reachableBaseHps(13.0)).toEqual([25900]);
  });
});

describe("bombsNeeded", () => {
  /**
   * The source spreadsheet prints, for every bomb, how many it takes against each
   * of the six base hitpoint tiers. Our formula has to reproduce that table
   * exactly — it is the only independent check that BASE_BLEED is right.
   */
  it("reproduces every count printed in the source chart", () => {
    const priced = chart.filter((b) => b.sheetCounts && b.damageValue !== null);
    expect(priced.length).toBeGreaterThan(150);

    const mismatches = priced.flatMap((bomb) =>
      BASE_HP_TIERS.flatMap((hp, i) => {
        const ours = bombsNeeded(hp, bomb.damageValue!);
        return ours === bomb.sheetCounts![i]
          ? []
          : [`${bomb.chartName} @ ${hp} HP: chart says ${bomb.sheetCounts![i]}, we say ${ours}`];
      }),
    );

    expect(mismatches).toEqual([]);
  });

  it("rounds up — a bomb that leaves the base standing does not count", () => {
    // 4000 HP needs 3607 damage; one 3600-damage bomb is a hair short.
    expect(bombsNeeded(4000, 3600)).toBe(2);
    expect(bombsNeeded(4000, 3608)).toBe(1);
  });
});

describe("effectiveBaseHp", () => {
  it("leaves realistic battles on four-base maps alone", () => {
    expect(effectiveBaseHp(10000, "rb", 4)).toBe(10000);
  });

  it("doubles in arcade", () => {
    expect(effectiveBaseHp(10000, "ab", 4)).toBe(20000);
  });

  it("follows the game's own tiers on three-base maps", () => {
    expect(effectiveBaseHp(4000, "rb", 3)).toBe(6000);
    expect(effectiveBaseHp(10000, "rb", 3)).toBe(10000);
    // Norway at BR 5.0: an A-26B-10 base paid exactly 3/4 of a 16 000 HP one.
    expect(effectiveBaseHp(16000, "rb", 3)).toBe(12000);
    expect(effectiveBaseHp(25900, "rb", 3)).toBe(12000);
  });

  it("takes the template's arcade multiplier on three-base maps", () => {
    expect(effectiveBaseHp(4000, "ab", 3)).toBe(15000);
    expect(effectiveBaseHp(25900, "ab", 3)).toBe(50400);
  });
});
