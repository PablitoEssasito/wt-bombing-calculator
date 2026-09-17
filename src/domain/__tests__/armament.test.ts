import { describe, expect, it } from "vitest";
import { parseArmament, presetPath } from "../../../scripts/armament/parse";

/** A hardpoint aircraft, cut down to the shape the parser cares about. */
const pylonFm = {
  WeaponSlots: {
    maxloadMass: 3730,
    maxloadMassLeftConsoles: 1865,
    maxloadMassRightConsoles: 1865,
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
    expect(armament.slots.map((s) => s.index)).toEqual([1, 2]);
    expect(armament.slots[0].options.map((o) => o.name)).toEqual(["hvar", "500lbs_slot1"]);
    expect(armament.maxLoadKg).toBe(3730);
    expect(armament.maxLeftKg).toBe(1865);
    expect(armament.maxRightKg).toBe(1865);
    expect(armament.maxDisbalanceKg).toBe(1200);
    expect(armament.bans).toEqual([
      { slot: 1, preset: "500lbs_slot1", otherSlot: 2, otherPreset: "250lbs_slot2" },
    ]);
  });

  it("keeps hardpoint numbering as the game gives it, gaps and all", () => {
    // The Hunter F58A numbers ten hardpoints 1-5 and 8-12. Treating the count as
    // the highest index would put half of them out of range.
    const sparse = {
      WeaponSlots: {
        WeaponSlot: [
          { index: 0, WeaponPreset: { name: "guns" } },
          { index: 1, WeaponPreset: { name: "a" } },
          { index: 8, WeaponPreset: { name: "b" } },
          { index: 12, WeaponPreset: { name: "c" } },
        ],
      },
    };
    expect(parseArmament(sparse, new Map()).slots.map((s) => s.index)).toEqual([1, 8, 12]);
  });

  it("marks the choices the loadout menu hides", () => {
    const withHidden = {
      WeaponSlots: {
        WeaponSlot: [
          {
            index: 1,
            WeaponPreset: [
              { name: "shown" },
              { name: "internal_only", showInWeaponMenu: false },
            ],
          },
        ],
      },
    };
    const slot = parseArmament(withHidden, new Map()).slots[0];
    expect(slot.options.map((o) => o.name)).toEqual(["shown", "internal_only"]);
    expect(slot.options.map((o) => o.hidden)).toEqual([false, true]);
  });

  it("counts repeated mounting points and the ammunition figure separately", () => {
    // A Tu-95M's bomb bay is written as one entry per station; a gun is one
    // entry stating its magazine. Both land here as a count, and only the store
    // catalogue can say which is which — so both numbers have to survive.
    const withStores = {
      WeaponSlots: {
        WeaponSlot: [
          {
            index: 1,
            WeaponPreset: [
              {
                name: "fab_250_x3",
                Weapon: [
                  { blk: "gameData/Weapons/BombGuns/su_fab_250m_46.blk", bullets: 1 },
                  { blk: "gameData/Weapons/BombGuns/su_fab_250m_46.blk", bullets: 1 },
                  { blk: "gameData/Weapons/BombGuns/su_fab_250m_46.blk", bullets: 1 },
                ],
              },
              {
                name: "gun_pod",
                Weapon: { blk: "gameData/Weapons/cannon_mauser_bk_27.blk", bullets: 150 },
              },
              // A rail states how many it holds beside the reference.
              {
                name: "aim9_x2",
                Weapon: { blk: "gameData/Weapons/rocketGuns/aero_3b_aim9b.blk", bullets: 2 },
              },
            ],
          },
        ],
      },
    };
    const options = parseArmament(withStores, new Map()).slots[0].options;

    expect(options[0].stores).toEqual([{ file: "su_fab_250m_46", entries: 3, bullets: 3 }]);
    expect(options[1].stores).toEqual([{ file: "cannon_mauser_bk_27", entries: 1, bullets: 150 }]);
    expect(options[2].stores).toEqual([{ file: "aero_3b_aim9b", entries: 1, bullets: 2 }]);
  });

  it("reads dependencies alongside exclusions", () => {
    const withDependency = {
      WeaponSlots: {
        WeaponSlot: [
          {
            index: 3,
            WeaponPreset: {
              name: "pod",
              DependentWeaponPreset: { slot: 4, preset: "pylon_adapter" },
            },
          },
        ],
      },
    };
    const armament = parseArmament(withDependency, new Map());
    expect(armament.bans).toEqual([]);
    expect(armament.requires).toEqual([
      { slot: 3, preset: "pod", otherSlot: 4, otherPreset: "pylon_adapter" },
    ]);
  });

  it("calls an aircraft with no hardpoint list all-or-nothing", () => {
    const armament = parseArmament(setupFm, new Map());

    expect(armament.style).toBe("setups");
    expect(armament.slots).toEqual([]);
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
