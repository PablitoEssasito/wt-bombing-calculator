import { describe, expect, it } from "vitest";
import { categoryOf } from "../../../scripts/armament/stores";

const none = new Set<string>();

describe("categoryOf a missile", () => {
  it("follows the trigger the aircraft mount it with, the way the game's tooltip does", () => {
    // GROM: SACLOS, fired from the air-to-ground trigger.
    const grom = { guidanceType: "saclos", guidance: { lineOfSightAutopilot: {} } };
    expect(categoryOf("missile", grom, undefined, new Set(["atgm"]))).toBe("agm");
    // Exocet AM39: an active radar seeker, but an anti-ship missile.
    expect(categoryOf("missile", { guidance: { radarSeeker: { active: true } } }, "aam", new Set(["atgm"]))).toBe("agm");
    // X-4: flown by hand, yet an air-to-air missile.
    expect(categoryOf("missile", { operated: true }, undefined, new Set(["aam"]))).toBe("aam");
  });

  it("files a missile steered along a line of sight at the ground where no aircraft names its trigger", () => {
    // Kornet on the Orion drone: beam riding, and the price list's air-to-air role says nothing about it.
    const kornet = { guidance: { lineOfSightAutopilot: {}, beamRider: true } };
    expect(categoryOf("missile", kornet, "aam", none)).toBe("agm");
  });

  it("keeps the price list's word, then the seeker's, where there is no trigger to go by", () => {
    // R-40RD: semi-active radar.
    expect(categoryOf("missile", { guidance: { radarSeeker: {} } }, "aam", none)).toBe("aam");
    expect(categoryOf("missile", { guidanceType: "laser", guidance: {} }, undefined, none)).toBe("agm");
    expect(categoryOf("missile", { guidance: { opticalSeeker: {} } }, undefined, none)).toBe("aam");
    // Mounted both ways, the trigger settles nothing.
    expect(categoryOf("missile", { guidance: { radarSeeker: {} } }, "aam", new Set(["aam", "atgm"]))).toBe("aam");
  });

  it("leaves bombs, rockets and the rest as they are", () => {
    expect(categoryOf("bomb", { guidance: {} }, undefined, new Set(["aam"]))).toBe("guidedBomb");
    expect(categoryOf("rocket", {}, undefined, new Set(["atgm"]))).toBe("rocket");
  });
});
