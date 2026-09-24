import { describe, expect, it } from "vitest";
import bombData from "../../data/bombs.json";
import bombIconData from "../../data/bomb-icons.json";
import { matchBombIcons, type WeaponDef } from "../../../scripts/bomb-icons/match";
import { bombIconsFor } from "../../lib/dataset";
import { presetIcons, type PresetIcon } from "../preset-icons";
import type { Bomb } from "../types";

const bombs = bombData as Bomb[];
const bombIcons = bombIconData as Record<string, string>;

/**
 * A handful of weapon definitions shaped like the real ones, covering the cases
 * the matcher has to get right: same mass shared by different kinds, a drag and
 * a plain variant of the same bomb, and a mine (which carries no iconType at
 * all in the game's own data).
 */
const DEFS: WeaponDef[] = [
  { path: "bombguns/us_100lb_anm30.blkx", iconType: "bombs_small", massKg: 49.9, isMine: false, isRocket: false, isGuided: false, isDrag: false, isIncendiary: false },
  // Shares AN-M30A1's mass, but is a napalm filling — must not steal its icon.
  { path: "bombguns/xx_100lb_incendiary.blkx", iconType: "napalm_small", massKg: 49.9, isMine: false, isRocket: false, isGuided: false, isDrag: false, isIncendiary: true },
  { path: "bombguns/us_500lb_mk_82_ldgp.blkx", iconType: "bombs_middle", massKg: 240.9, isMine: false, isRocket: false, isGuided: false, isDrag: false, isIncendiary: false },
  { path: "bombguns/us_500lb_mk_82_ldgp_snakeye.blkx", iconType: "bombs_middle_high_drag", massKg: 240.9, isMine: false, isRocket: false, isGuided: false, isDrag: true, isIncendiary: false },
  { path: "bombguns/us_2000lb_gbu31_usaf.blkx", iconType: "bombs_heavy_middle", massKg: 893.6, isMine: false, isRocket: false, isGuided: true, isDrag: false, isIncendiary: false },
  { path: "mines/uk_mine_type_a_mk1.blkx", iconType: null, massKg: 680, isMine: true, isRocket: false, isGuided: false, isDrag: false, isIncendiary: false },
  { path: "rocketguns/us_5_in_hvar.blkx", iconType: "rockets_he_small", massKg: 62.8, isMine: false, isRocket: true, isGuided: false, isDrag: false, isIncendiary: false },
];

const bomb = (over: Partial<Bomb>): Bomb =>
  ({
    id: "x", chartName: "", fullName: "", kind: "GP", massKg: null, massLabel: "",
    tntKg: null, damageValue: null, efficiency: null, sheetCounts: null, ...over,
  }) as Bomb;

describe("matchBombIcons", () => {
  it("finds the exact weapon by mass when only one candidate carries it", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "AN-M30A1", kind: "GP", massKg: 49.9 })], DEFS);
    expect(matches.get("a")).toEqual({ iconType: "bombs_small", confidence: "matched" });
  });

  it("uses kind to pick between same-mass candidates of different families", () => {
    // Same 49.9 kg as AN-M30A1, but incendiary — must land on the napalm icon, not bombs_small.
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "Something", kind: "INC", massKg: 49.9 })], DEFS);
    expect(matches.get("a")?.iconType).toBe("napalm_small");
  });

  it("gives a drag-tagged bomb the high-drag icon even though a plain twin shares its mass", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "Mk 82 Snake Eye", kind: "DRAG", massKg: 240.9 })], DEFS);
    expect(matches.get("a")?.iconType).toBe("bombs_middle_high_drag");
  });

  it("never gives a plain GP bomb a guided-weapon icon", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "Mk 82", kind: "GP", massKg: 240.9 })], DEFS);
    expect(matches.get("a")?.iconType).toBe("bombs_middle");
  });

  it("never gives a plain GP bomb its retarded twin's icon, even with no name to go on", () => {
    // Only the Snake Eye file sits at this mass among the drag-tagged ones, and
    // the chart name shares no letters with either file — so nothing but the
    // kind rule keeps the high-drag icon off a plain bomb.
    const { matches } = matchBombIcons(
      [bomb({ id: "a", chartName: "Zzz", kind: "GP", massKg: 240.9 })],
      DEFS.filter((d) => !d.path.includes("mk_82_ldgp.blkx")),
    );
    expect(matches.get("a")?.iconType.includes("high_drag")).toBe(false);
  });

  it("gives a guided bomb the guided icon, not the plain one at the same mass class", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "GBU-31", kind: "GNSS", massKg: 893.6 })], DEFS);
    expect(matches.get("a")?.iconType).toBe("bombs_heavy_middle");
  });

  it("gives a mine the generic mine icon, since mine files carry no iconType of their own", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "Type A", kind: "MINE", massKg: 680 })], DEFS);
    expect(matches.get("a")).toEqual({ iconType: "air_mines", confidence: "matched" });
  });

  it("matches a rocket by mass and kind exactly like a bomb", () => {
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "HVAR", kind: "ROCKET", massKg: 62.8 })], DEFS);
    expect(matches.get("a")).toEqual({ iconType: "rockets_he_small", confidence: "matched" });
  });

  it("never gives an unguided rocket a guided missile's icon at the same mass", () => {
    // rocketguns/ files the ATGMs alongside the plain rockets; the 8-cm Flz.-Rakete
    // really did land on atgm_type1x1 this way before the kind rule excluded them.
    const atgm: WeaponDef = {
      path: "rocketguns/xx_atgm.blkx",
      iconType: "atgm_type1x1",
      massKg: 62.8,
      isMine: false,
      isRocket: true,
      isGuided: true,
      isDrag: false,
      isIncendiary: false,
    };
    const { matches } = matchBombIcons(
      [bomb({ id: "a", chartName: "Zzz", kind: "ROCKET", massKg: 62.8 })],
      [atgm, ...DEFS],
    );
    expect(matches.get("a")).toEqual({ iconType: "rockets_he_small", confidence: "matched" });
  });

  it("never gives a rocket a bomb-shaped fallback just because a mass-matched candidate carries no icon of its own", () => {
    // A rail/launcher file with no iconType (the way mines have none) must not
    // win the tie-break and blank the match — it should be skipped in favour of
    // the real, icon-bearing candidate at the same mass.
    const iconless: WeaponDef = {
      path: "rocketguns/xx_launcher_rail.blkx",
      iconType: null,
      massKg: 62.8,
      isMine: false,
      isRocket: true,
      isGuided: false,
      isDrag: false,
      isIncendiary: false,
    };
    const { matches } = matchBombIcons(
      [bomb({ id: "a", chartName: "HVAR", kind: "ROCKET", massKg: 62.8 })],
      [...DEFS, iconless],
    );
    expect(matches.get("a")).toEqual({ iconType: "rockets_he_small", confidence: "matched" });
  });

  it("falls back to the nearest size class rather than leaving a bomb with no icon", () => {
    // No candidate anywhere near 5000 kg in this small fixture.
    const { matches, unmatched } = matchBombIcons(
      [bomb({ id: "a", chartName: "Huge Bomb", kind: "GP", massKg: 5000 })],
      DEFS,
    );
    expect(unmatched).toHaveLength(0);
    expect(matches.get("a")?.confidence).toBe("fallback");
  });

  it("never lets a rocket's icon leak into a same-mass bomb's fallback", () => {
    // 62.8 kg is exactly the HVAR's mass; a GP bomb landing there by coincidence
    // must not inherit a rocket-shaped icon.
    const { matches } = matchBombIcons([bomb({ id: "a", chartName: "Coincidence", kind: "GP", massKg: 62.8 })], DEFS);
    const icon = matches.get("a")?.iconType ?? "";
    expect(icon.startsWith("rockets_")).toBe(false);
    expect(icon.startsWith("bombs_")).toBe(true);
  });
});

describe("presetIcons", () => {
  const known = new Set(["bombs_large", "bombs_special", "bombs_large_high_drag", "rockets_he_large"]);

  it("takes the single-round icon the presets draw a bomb with most often", () => {
    const icons = presetIcons(
      [
        { iconType: "bombs_large", bombIds: ["mk-83"] },
        { iconType: "bombs_large_group_x4", bombIds: ["mk-83"] },
        { iconType: "bombs_special", bombIds: ["mk-83"] },
      ],
      known,
    );
    expect(icons.get("mk-83")).toBe("bombs_large");
  });

  it("reads through the rack and pod suffixes to the round itself", () => {
    const icons = presetIcons(
      [{ iconType: "bombs_large_high_drag_maws_ltc_pod", bombIds: ["a"] }],
      known,
    );
    expect(icons.get("a")).toBe("bombs_large_high_drag");
  });

  it("ignores presets that mix bombs, since their icon speaks for neither", () => {
    const icons = presetIcons([{ iconType: "bombs_large", bombIds: ["a", "b"] }], known);
    expect(icons.size).toBe(0);
  });

  it("settles a tie on the icon that matches the bomb's own kind", () => {
    const tied: PresetIcon[] = [
      { iconType: "bombs_large_high_drag", bombIds: ["a"] },
      { iconType: "bombs_large", bombIds: ["a"] },
    ];
    expect(presetIcons(tied, known, new Map([["a", "GP"]])).get("a")).toBe("bombs_large");
    expect(presetIcons(tied, known, new Map([["a", "DRAG"]])).get("a")).toBe("bombs_large_high_drag");
  });

  it("ignores a group icon with no single-round counterpart in the game's data", () => {
    const icons = presetIcons([{ iconType: "rockets_large_group", bombIds: ["a"] }], known);
    expect(icons.size).toBe(0);
  });
});

describe("each aircraft's own menu icons", () => {
  const iconOn = (aircraftId: string, bombId: string) => bombIconsFor(aircraftId)[bombId] ?? bombIcons[bombId];

  // Every row read off an in-game loadout menu screenshot; the game draws the
  // same bomb a size apart from one aircraft to the next.
  it.each([
    ["usa-a-26b-10", { "an-m30a1": "bombs_small", "an-m57": "bombs_middle", "an-m64a1": "bombs_large", "an-m65a1": "bombs_special" }],
    ["usa-f-84f", { "mk-81": "bombs_middle", "mk-82": "bombs_large", "mk-83": "bombs_heavy_middle", "mk-84": "bombs_special" }],
    ["britain-mosquito-b-xvi", { "g-p-250": "bombs_small", "g-p-500": "bombs_middle" }],
    ["germany-do-217-e-2", { sc50: "bombs_small", sc250: "bombs_middle", sc500: "bombs_large", sc1000: "bombs_heavy_middle" }],
    ["usa-p-61c-1", { "an-m64a1": "bombs_middle", "an-m65a1": "bombs_large" }],
    ["britain-corsair-f-ii", { "an-m65a1": "bombs_large" }],
    ["usa-pbm-3", { "type-a": "air_mines" }],
    ["britain-harrier-gr-3", { "1000-lb-h-e-m-c-mk-13": "bombs_large" }],
    // These the game files cannot reach — see AIRCRAFT_ICON_OVERRIDES.
    ["britain-tornado-gr-4", { "pgm-2000": "guided_bomb_grey" }],
    ["china-su-30mkk", { "fab-1500": "bombs_heavy_middle" }],
    ["ussr-tu-95m", { "fab-1500": "bombs_heavy_middle" }],
    ["israel-m-d-450b", { "mk-2": "napalm_small" }],
    ["israel-mystere-iva", { "mk-2": "napalm_small" }],
    ["japan-h8k3", { "navy-250-25": "bombs_large" }],
    ["usa-a-4b", { "mk-77": "napalm_middle" }],
    ["usa-f-4j", { "mk-77": "napalm_small" }],
    ["usa-f-15a", { "gbu-8": "guided_bomb_green" }],
  ])("draws %s's bombs the way the game's menu does", (aircraftId, expected) => {
    for (const [bombId, iconType] of Object.entries(expected)) expect(iconOn(aircraftId, bombId)).toBe(iconType);
  });

  it("reads a fixed-setup aircraft's per-preset icons, and the weapon file's where it states none", () => {
    // From LEGION's sheet, which pictures each loadout's menu row: the B-29
    // states its own icons, the PBJ-1J leaves the AN-M65 to its weapon file.
    expect(iconOn("usa-b-29a-bn", "an-m65a1")).toBe("bombs_large");
    expect(iconOn("usa-b-29a-bn", "an-m66a2")).toBe("bombs_special");
    expect(iconOn("usa-pbj-1j", "an-m65a1")).toBe("bombs_special");
  });
});

describe("the imported bomb icon map", () => {
  it("covers every bomb in the dataset", () => {
    for (const b of bombs) expect(bombIcons[b.id]).toBeDefined();
  });

  it("only ever points at a plausible icon key", () => {
    for (const iconType of Object.values(bombIcons)) {
      expect(iconType.length).toBeGreaterThan(0);
      expect(iconType).not.toContain("/");
    }
  });
});
