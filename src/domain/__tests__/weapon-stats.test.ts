import { describe, expect, it } from "vitest";
import { armourPiercingOf, dragOf, explosivesOf, guidanceOf, statsOf } from "../../../scripts/armament/stats";

/** explosive.blk, cut down to what these weapons use. */
const EXPLOSIVES = explosivesOf({
  explosiveTypes: {
    pbxn_3: { strengthEquivalent: 1.29, brisanceEquivalent: 1.29 },
    comp_h6: { strengthEquivalent: 1.35, brisanceEquivalent: 1.35 },
    tnt: { strengthEquivalent: 1, brisanceEquivalent: 1 },
    napalm: { strengthEquivalent: 0.002, brisanceEquivalent: 0.002 },
  },
  explosiveTypeToSplashParams: {
    explosiveMassToPenetration: { p0: [0.005, 2], p1: [2, 25], p2: [120, 82], p3: [700, 127] },
    explosiveMassToInnerRadius: { p0: [0.001, 0.005], p1: [100, 3.2], p2: [150, 3.6] },
    explosiveMassToOuterRadius: { p0: [0.001, 0.1], p1: [100, 12.5], p2: [150, 15] },
  },
  explosiveTypeToShattersParams: {
    he_frag: { fillingRatio: 1, explosiveMassToRadius: { p0: [0.01, 1.5], p1: [200, 120] } },
  },
});

/** The KD-88's own file, as far as the tooltip reads it (weapons/rocketguns/ch_kd_88_missile_tv). */
const KD_88 = {
  rocket: {
    mass: 710,
    machMax: 0.85,
    endSpeed: 2000,
    rangeMax: 230000,
    timeLife: 825,
    guidanceType: "optical",
    explosiveType: "pbxn_3",
    explosiveMass: 70.5,
    penetrationBySpeed: true,
    guidance: {
      inertialNavigation: true,
      inertialNavigationDriftSpeed: 0,
      opticalSeeker: { targetSignatureType: "optic", rangeBand0: 12000, groundVehiclesAsTarget: true },
    },
  },
};

describe("guidanceOf", () => {
  it("builds the key the game labels guidance by", () => {
    expect(guidanceOf(KD_88.rocket)).toBe("tv+IOG+GNSS");
    expect(guidanceOf({ guidanceType: "laser" })).toBe("laser");
    expect(guidanceOf({ guidanceType: "sns" })).toBe("sns");
    // INS that drifts is inertial alone: no satellite aid.
    expect(
      guidanceOf({ guidanceType: "optical", guidance: { opticalSeeker: {}, inertialNavigation: true, inertialNavigationDriftSpeed: 2.2 } }),
    ).toBe("ir+IOG");
  });

  it("names a radar seeker active, semi-active or passive as the game does", () => {
    const radar = (radarSeeker: Record<string, unknown>) => guidanceOf({ guidanceType: "radar", guidance: { radarSeeker } });
    expect(radar({ active: true })).toBe("ARH");
    expect(radar({})).toBe("SARH");
    expect(radar({ active: false })).toBe("PRH");
    expect(
      guidanceOf({ guidance: { radarSeeker: { active: true }, inertialNavigation: true, datalink: {} } }),
    ).toBe("ARH+IOG+DL");
  });
});

describe("dragOf", () => {
  it("calls a bomb high-drag by its fins or chute, not by the drag every guided bomb states", () => {
    // Snakeye: the brake opens on release.
    expect(dragOf({ brakeArm: 0.5, brakeCxK: 110 })).toBe(true);
    // A glide or guided bomb's own drag, and the RDS-37's.
    expect(dragOf({ brakeCxK: 0.05 })).toBe(false);
    expect(dragOf({ brakeCxK: 0.2 })).toBe(false);
    expect(dragOf({})).toBe(false);
  });
});

describe("armourPiercingOf", () => {
  it("reads armour-piercing and semi-armour-piercing off the bomb's own type", () => {
    // BRAB-500: a kinetic bomb.
    expect(armourPiercingOf({ bulletType: "ke_bomb", penetrationBySpeed: true })).toBe("ap");
    // SD 50: a blast bomb that also pierces.
    expect(armourPiercingOf({ bulletType: "he_bomb", penetrationBySpeed: true })).toBe("sap");
    expect(armourPiercingOf({ bulletType: "he_bomb" })).toBeNull();
    expect(armourPiercingOf({})).toBeNull();
  });
});

describe("statsOf", () => {
  it("reads the KD-88 the way the game's tooltip shows it", () => {
    const stats = statsOf(KD_88, "agm", EXPLOSIVES);
    expect(stats).toMatchObject({
      massKg: 710,
      guidance: "tv+IOG+GNSS",
      launchRangeM: 230000,
      machMax: 0.85,
      timeLifeS: 825,
      explosiveType: "pbxn_3",
      explosiveMassKg: 70.5,
      warhead: "aphe",
    });
    expect(stats.tntKg).toBeCloseTo(90.95, 2);
    // Its TV seeker states no all-aspect range, so the tooltip gives no lock range.
    expect(stats.seekerRangeM).toBeUndefined();
    // Mach given, so no speed in m/s beside it.
    expect(stats.maxSpeedMs).toBeUndefined();
  });

  it("gives an air-to-ground seeker's lock range as its shorter band", () => {
    const kd88a = { rocket: { ...KD_88.rocket, guidance: { ...KD_88.rocket.guidance, opticalSeeker: { targetSignatureType: "infraRed", rangeBand0: 20000, rangeBand1: 25000, groundVehiclesAsTarget: true } } } };
    expect(statsOf(kd88a, "agm", EXPLOSIVES).seekerRangeM).toBe(20000);
  });

  it("gives a bomb its blast's reach, and a fire bomb no TNT figure", () => {
    const mk82 = { bomb: { mass: 240.9, mass_lbs: 531, explosiveType: "comp_h6", explosiveMass: 87.1 } };
    const stats = statsOf(mk82, "bomb", EXPLOSIVES);
    expect(stats.massLbs).toBe(531);
    expect(stats.tntKg).toBeCloseTo(117.585, 3);
    expect(stats.blastPenetrationMm).toBeGreaterThan(50);
    expect(stats.destroyRadiusArmoredM).toBeGreaterThan(0);
    expect(stats.warhead).toBeUndefined();

    const napalm = { bomb: { mass: 401, explosiveType: "napalm", explosiveMass: 358, fireDamage: {} } };
    expect(statsOf(napalm, "bomb", EXPLOSIVES).tntKg).toBeUndefined();
  });

  it("leaves the TNT figure out for TNT itself, as the tooltip does", () => {
    const fab = { bomb: { mass: 100, explosiveType: "tnt", explosiveMass: 50 } };
    expect(statsOf(fab, "bomb", EXPLOSIVES).tntKg).toBeUndefined();
  });

  it("marks a seeker IRCCM where the game's tooltip does", () => {
    const irccm = (opticalSeeker: Record<string, unknown>, guidanceType = "optical") =>
      statsOf({ rocket: { guidanceType, guidance: { opticalSeeker } } }, "aam", EXPLOSIVES).irccm;
    // AIM-9M: it rejects the flares' band.
    expect(irccm({ rangeBand0: 11000, rangeBand1: 3000, bandMaskToReject: 4, fov: 3.6 })).toBe(true);
    // R-73: its tracking gate is narrower than its field of view.
    expect(irccm({ rangeBand0: 11000, rangeBand1: 3400, gateWidth: 0.75, fov: 4.5 })).toBe(true);
    // AIM-9L: neither.
    expect(irccm({ rangeBand0: 11000, rangeBand1: 3000, fov: 3.6 })).toBeUndefined();
    // A gate as wide as the view narrows nothing.
    expect(irccm({ gateWidth: 4.5, fov: 4.5 })).toBeUndefined();
    // The tooltip reads the gate on a TV seeker too, the band mask on an IR one only.
    expect(irccm({ gateWidth: 1, fov: 2 }, "tv")).toBe(true);
    expect(irccm({ bandMaskToReject: 4, fov: 2 }, "tv")).toBeUndefined();
  });

  it("marks a weapon flown by hand rather than guided", () => {
    const bullpup = { rocket: { mass: 259, operated: true, autoAiming: false } };
    const stats = statsOf(bullpup, "agm", EXPLOSIVES);
    expect(stats.aiming).toBe("manual");
    expect(stats.guidance).toBeUndefined();
  });
});
