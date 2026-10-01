import { describe, expect, it } from "vitest";
import type { WeaponStats } from "../../domain/types";
import { figureGroups } from "../weapon-figures";

const words = {
  label: (key: string) => key,
  number: (value: number) => String(value),
  groups: { guidance: "Guidance", flight: "Flight", warhead: "Warhead", blast: "Blast" },
  fireRate: "Rate of fire",
  nuclearYield: "Yield",
  yes: "Yes",
};

const guidanceOf = (stats: WeaponStats) =>
  figureGroups(stats, words)
    .find((group) => group.key === "guidance")
    ?.lines.map(({ key, value }) => [key, value]);

describe("figureGroups", () => {
  it("says a seeker resists flares as the tooltip does, after its lock range", () => {
    expect(guidanceOf({ guidance: "ir", allAspect: true, seekerRangeAllM: 3500, irccm: true, launchRangeM: 12000 })).toEqual([
      ["guidance", "missile/guidance/ir"],
      ["aspect", "missile/aspect/allAspect"],
      ["seekerRangeAllM", "3.5 km"],
      ["irccm", "Yes"],
      ["launchRangeM", "12 km"],
    ]);
  });

  it("leaves the line out for a seeker without it", () => {
    expect(guidanceOf({ guidance: "ir", allAspect: false })?.map(([key]) => key)).not.toContain("irccm");
  });
});
