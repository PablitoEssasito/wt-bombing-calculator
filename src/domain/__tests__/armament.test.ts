import { describe, expect, it } from "vitest";
import { parseArmament, presetPath } from "../../../scripts/armament/parse";

/** A hardpoint aircraft, cut down to the shape the parser cares about. */
const pylonFm = {
  WeaponSlots: {
    maxloadMass: 3730,
    maxloadMassLeftConsoles: 1865,
    maxDisbalance: 1200,
    WeaponSlot: [
      // Slot zero is the fixed cannon armament, not something you choose.
      { index: 0, WeaponPreset: { name: "default_common", Weapon: [] } },
      {
        index: 1,
        WeaponPreset: [
          { name: "hvar", Weapon: [] },
          {
            name: "500lbs_slot1",
            Weapon: [],
            BannedWeaponPreset: { slot: 2, preset: "250lbs_slot2" },
          },
        ],
      },
      { index: 2, WeaponPreset: { name: "250lbs_slot2", Weapon: [] } },
    ],
  },
  weapon_presets: {
    preset: [{ name: "au1_2x1000", blk: "gameData/FlightModels/weaponPresets/au1_2x1000.blk" }],
  },
};

/** A bomber with no editor: the presets are the only choices there are. */
const setupFm = {
  weapon_presets: {
    preset: [
      { name: "pe-8_default", blk: "gameData/FlightModels/weaponPresets/pe-8_default.blk" },
      { name: "pe-8_32xfab100", blk: "gameData/FlightModels/weaponPresets/pe-8_32xfab100.blk" },
    ],
  },
};

describe("parseArmament", () => {
  it("reads hardpoints, limits and exclusions from a pylon aircraft", () => {
    const armament = parseArmament(pylonFm, new Map());

    expect(armament.style).toBe("pylons");
    // Slot zero is excluded: two hardpoints can actually be loaded.
    expect(armament.slots).toBe(2);
    expect(armament.maxLoadKg).toBe(3730);
    expect(armament.maxPerConsoleKg).toBe(1865);
    expect(armament.maxDisbalanceKg).toBe(1200);
    expect(armament.bans).toEqual([
      { slot: 1, preset: "500lbs_slot1", bansSlot: 2, bansPreset: "250lbs_slot2" },
    ]);
  });

  it("calls an aircraft with no hardpoint list all-or-nothing", () => {
    const armament = parseArmament(setupFm, new Map());

    expect(armament.style).toBe("setups");
    expect(armament.slots).toBe(0);
    expect(armament.bans).toEqual([]);
    expect(armament.presets.map((p) => p.name)).toEqual(["pe-8_default", "pe-8_32xfab100"]);
  });

  it("counts a preset's bombs whichever way the file spells them", () => {
    const bodies = new Map([
      [
        "pe-8_32xfab100",
        {
          Weapon: [
            // One entry per hardpoint, the older spelling.
            { trigger: "bombs", blk: "gameData/Weapons/BombGuns/su_fab100.blk", bullets: 20 },
            { trigger: "bombs", blk: "gameData/Weapons/BombGuns/su_fab100.blk", bullets: 20 },
          ],
        },
      ],
    ]);
    const armament = parseArmament(setupFm, bodies);
    const loaded = armament.presets.find((p) => p.name === "pe-8_32xfab100");

    expect(loaded?.weapons).toEqual([{ weapon: "su_fab100", count: 40 }]);
    // A preset whose file we never read reports no weapons rather than guessing.
    expect(armament.presets.find((p) => p.name === "pe-8_default")?.weapons).toEqual([]);
  });

  it("names a slot preset when the entry points at one instead of a weapon file", () => {
    const bodies = new Map([
      ["au1_2x1000", { Weapon: [{ slot: 1, preset: "hvar" }, { slot: 3, preset: "hvar" }] }],
    ]);
    const armament = parseArmament(pylonFm, bodies);

    expect(armament.presets[0].weapons).toEqual([{ weapon: "hvar", count: 2 }]);
  });
});

describe("presetPath", () => {
  it("rewrites a game-data reference into the datamine's own path", () => {
    expect(presetPath("gameData/FlightModels/weaponPresets/A-20G_default.blk")).toBe(
      "flightmodels/weaponpresets/a-20g_default.blkx",
    );
  });
});
