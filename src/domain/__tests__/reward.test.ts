import { describe, expect, it } from "vitest";
import aircraft from "../../data/aircraft.json";
import bombs from "../../data/bombs.json";
import { rewardMultiplier } from "../reward";
import type { Aircraft, Bomb } from "../types";

const byId = new Map((bombs as Bomb[]).map((b) => [b.id, b]));

describe("rewardMultiplier", () => {
  it("holds at the cap for light payloads", () => {
    expect(rewardMultiplier(10000, "tt-bomber")).toBe(10);
    expect(rewardMultiplier(10000, "tt-fighter")).toBe(8);
    expect(rewardMultiplier(22000, "premium-bomber")).toBe(10);
  });

  it("falls as the payload's damage grows", () => {
    expect(rewardMultiplier(25886, "tt-bomber")).toBe(7.6);
    expect(rewardMultiplier(25886, "tt-fighter")).toBe(6.1);
    expect(rewardMultiplier(25886, "premium-fighter")).toBeCloseTo(7.2, 0);
    expect(rewardMultiplier(51772, "tt-fighter")).toBe(4);
  });

  it("reproduces the sheet's own multipliers for the loadouts it prices", () => {
    // The sheet's figure is priced on the whole preset, rockets and all, while
    // a schedule only lists what gets dropped — so a few loadouts carry more
    // than we can sum here and sit a little off. The bulk must match.
    let total = 0;
    let close = 0;
    for (const plane of aircraft as Aircraft[]) {
      for (const option of plane.options) {
        if (option.rewardMultiplier === null) continue;
        const items = option.schedules[0].bases.flatMap((b) => b.items);
        const damage = items.reduce(
          (sum, it) => sum + (byId.get(it.bombId)?.damageValue ?? NaN) * it.count,
          0,
        );
        if (!(damage > 0)) continue;
        total++;
        if (Math.abs(rewardMultiplier(damage, plane.category) - option.rewardMultiplier) <= 0.11)
          close++;
      }
    }
    expect(close / total).toBeGreaterThan(0.85);
  });
});
