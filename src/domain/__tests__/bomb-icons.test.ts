import { describe, expect, it } from "vitest";
import bombData from "../../data/bombs.json";
import bombIconData from "../../data/bomb-icons.json";
import { matchBombIcons, type WeaponDef } from "../../../scripts/bomb-icons/match";
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
