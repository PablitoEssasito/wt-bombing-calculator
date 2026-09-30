import { describe, expect, it } from "vitest";
import { kindOfRound, massLabelOf, reconcile, sheetView } from "../../../scripts/armament/reconcile";
import type { Round } from "../../../scripts/armament/stores";
import type { Bomb } from "../types";

const row = (over: Partial<Bomb>): Bomb => ({
  id: "x",
  chartName: "X",
  fullName: "X",
  kind: "GP",
  nation: "usa",
  massKg: 227,
  massLabel: "500 lb",
  tntKg: 118,
  damageValue: 2464,
  efficiency: 11,
  sheetCounts: null,
  usedByNations: [],
  ...over,
});

const round = (over: Partial<Round>): Round => ({
  file: "f",
  name: "F",
  short: "F",
  category: "bomb",
  bombId: "x",
  damage: 2464,
  damageSource: "game",
  tntKg: 117.585,
  incendiary: false,
  drag: false,
  armourPiercing: null,
  iconType: null,
  stats: { massKg: 240.9 },
  units: ["f-4e"],
  ...over,
});

const countryOf = () => "country_usa";

describe("reconcile", () => {
  it("takes the game's figures over the sheet's, keeping what the sheet printed", () => {
    const { rows, changes } = reconcile([row({ damageValue: 2372 })], [round({ damage: 2072 })], countryOf);
    expect(rows[0]).toMatchObject({ damageValue: 2072, damageSource: "game", massKg: 240.9, tntKg: 117.59 });
    expect(rows[0].sheet).toMatchObject({ damageValue: 2372, massKg: 227, tntKg: 118 });
    expect(changes).toContain("X: damageValue 2372 → 2072");
  });

  it("takes the explosion model's estimate over the sheet's figure where the game prices nothing", () => {
    const { rows, estimates } = reconcile(
      [row({ damageValue: 4700 })],
      [round({ damage: 4720, damageSource: "estimate" })],
      countryOf,
    );
    expect(rows[0]).toMatchObject({ damageValue: 4720, damageSource: "estimate" });
    expect(rows[0].sheet?.damageValue).toBe(4700);
    expect(estimates).toEqual(["X: sheet 4700, estimate 4720"]);
  });

  it("gives no damage where the game's files give nothing to go on, whatever the sheet says", () => {
    const { rows } = reconcile([row({ damageValue: 900 })], [round({ damage: null, damageSource: null })], countryOf);
    expect(rows[0].damageValue).toBeNull();
    expect(rows[0].damageSource).toBeUndefined();
  });

  it("gives a sheet row with no file of its own the figures of the game's weapon by the same name", () => {
    // The sheet's "G.P.1000(l)": the one 1000 lb G.P. Mk.I the Hampden hangs is its "G.P.1000(e)".
    const early = row({ id: "g-p-1000-e", chartName: "G.P.1000(e)", fullName: "1000 lb G.P. Mk.I", damageValue: 2906 });
    const late = row({ id: "g-p-1000-l", chartName: "G.P.1000(l)", fullName: "1000 lb G.P. Mk.I", damageValue: 5279, tntKg: 296 });
    const mk1 = round({ file: "uk_1000lbs_gp_mk1", bombId: "g-p-1000-e", damage: 2906, tntKg: 151.05, stats: { massKg: 495.7 } });
    const { rows, aliased } = reconcile([early, late], [mk1], countryOf);
    expect(rows[1]).toMatchObject({ damageValue: 2906, damageSource: "game", tntKg: 151.05, aliasOf: "g-p-1000-e" });
    expect(rows[1].sheet).toMatchObject({ damageValue: 5279, tntKg: 296 });
    expect(aliased).toEqual(["G.P.1000(l) → G.P.1000(e)"]);
    // A rerun starts from the sheet's own row again.
    expect(sheetView(rows[1])).toEqual(late);
  });

  it("leaves a sheet row the game has nothing for without figures", () => {
    const { rows, unmatched } = reconcile([row({ id: "mk-18", chartName: "Mk.18", fullName: "Mk.18", damageValue: 5230 })], [], countryOf);
    expect(rows[0]).toMatchObject({ damageValue: null, efficiency: null });
    expect(rows[0].sheet?.damageValue).toBe(5230);
    expect(unmatched).toEqual(["Mk.18"]);
  });

  it("follows a guided bomb's seeker, and leaves an unguided kind alone", () => {
    const guided = round({ category: "guidedBomb", stats: { massKg: 240.9, guidance: "laser+IOG+GNSS" } });
    const { rows } = reconcile([row({ kind: "GNSS" })], [guided], countryOf);
    expect(rows[0]).toMatchObject({ kind: "LAS", guidance: "laser+IOG+GNSS" });
    expect(rows[0].sheet?.kind).toBe("GNSS");
  });

  it("adds a row for every weapon the sheet has none for", () => {
    const kd88 = round({
      file: "ch_kd_88_missile_tv",
      name: "KD-88 air-to-ground missiles",
      short: "KD-88",
      category: "agm",
      bombId: "kd-88",
      damage: 2064,
      damageSource: "estimate",
      stats: { massKg: 710, guidance: "tv+IOG+GNSS" },
    });
    const { rows, stats } = reconcile([], [kd88], () => "country_china");
    expect(rows[0]).toMatchObject({
      id: "kd-88",
      chartName: "KD-88",
      fullName: "KD-88 air-to-ground missiles",
      kind: "AGM",
      guidance: "tv+IOG+GNSS",
      source: "game",
      nation: "china",
      damageValue: 2064,
      damageSource: "estimate",
      massLabel: "710 kg",
    });
    expect(stats["kd-88"].guidance).toBe("tv+IOG+GNSS");
  });

  it("undoes itself: a rerun on its own output starts from the sheet again", () => {
    const sheet = row({ damageValue: 2372 });
    const first = reconcile([sheet], [round({ damage: 2072 })], countryOf).rows[0];
    expect(sheetView(first)).toEqual(sheet);
    expect(reconcile([sheetView(first)], [round({ damage: 2072 })], countryOf).rows[0]).toEqual(first);
  });
});

describe("category and tags", () => {
  it("files a row under its round's category and tags", () => {
    const kd88 = round({ category: "agm", bombId: "kd-88", stats: { massKg: 710, guidance: "tv+IOG+GNSS", warhead: "aphe" } });
    const { rows } = reconcile([], [kd88], countryOf);
    expect(rows[0]).toMatchObject({ category: "agm", tags: ["tv", "iog", "gnssAid", "aphe"] });
  });

  it("tags a sheet row by the game's file, and reports where the sheet's kind says otherwise", () => {
    const { rows, types } = reconcile([row({ kind: "GP" })], [round({ armourPiercing: "sap" })], countryOf);
    expect(rows[0]).toMatchObject({ kind: "GP", category: "bomb", tags: ["sap", "unguided"] });
    expect(types).toEqual(["X: sheet GP, game sap"]);
    // A guided bomb is a bomb.
    const guided = round({ category: "guidedBomb", stats: { massKg: 240.9, guidance: "sns" } });
    expect(reconcile([row({ kind: "GNSS" })], [guided], countryOf).rows[0]).toMatchObject({ category: "bomb", tags: ["gp", "gnss"] });
  });

  it("tags a row by what most of its files are, its kind breaking a tie", () => {
    // O-100: two plain OFAB-100s and a Czech high-drag one, priced alike.
    const ofab = (file: string, drag: boolean) => round({ file, bombId: "o-100", drag });
    const o100 = reconcile(
      [row({ id: "o-100", kind: "GP" })],
      [ofab("cz_ofab_100mb", true), ofab("su_ofab_100_120", false), ofab("su_ofab100_120", false)],
      countryOf,
    );
    expect(o100.rows[0].tags).toEqual(["gp", "unguided"]);
    expect(o100.types).toEqual([]);
    // 500M-62: the plain bomb and its satellite-guided glide kit, one each; the sheet's row is the plain one.
    const fab = round({ file: "su_fab_500m_62t", bombId: "x" });
    const umpk = round({ file: "su_umpk_500m62", bombId: "x", category: "guidedBomb", stats: { massKg: 240.9, guidance: "sns" } });
    expect(reconcile([row({ kind: "GP" })], [umpk, fab], countryOf).rows[0].tags).toEqual(["gp", "unguided"]);
  });

  it("gives a sheet row the game has nothing for what its kind says, and an alias its twin's", () => {
    const { rows } = reconcile([row({ id: "mk-18", chartName: "Mk.18", fullName: "Mk.18", kind: "DRAG" })], [], countryOf);
    expect(rows[0]).toMatchObject({ category: "bomb", tags: ["drag", "unguided"] });

    const early = row({ id: "g-p-1000-e", chartName: "G.P.1000(e)", fullName: "1000 lb G.P. Mk.I" });
    const late = row({ id: "g-p-1000-l", chartName: "G.P.1000(l)", fullName: "1000 lb G.P. Mk.I", kind: "AP" });
    const mk1 = round({ bombId: "g-p-1000-e", drag: true });
    const aliased = reconcile([early, late], [mk1], countryOf).rows[1];
    expect(aliased).toMatchObject({ category: "bomb", tags: ["drag", "unguided"] });
  });
});

describe("a gun pod", () => {
  it("gets no mass: its file weighs the round, not the pod", () => {
    const bk27 = round({ file: "bk27", name: "27 mm Mauser BK27 cannon", short: "BK27", category: "gun", bombId: "bk27", damage: null, damageSource: null, stats: { massKg: 0.26, caliberMm: 27 } });
    const { rows } = reconcile([], [bk27], countryOf);
    expect(rows[0]).toMatchObject({ kind: "GUN", massKg: null, massLabel: "", damageValue: null });
  });
});

describe("kindOfRound", () => {
  it("sorts a game-only row by what its file says it is", () => {
    expect(kindOfRound(round({ incendiary: true }))).toBe("INC");
    expect(kindOfRound(round({ drag: true }))).toBe("DRAG");
    expect(kindOfRound(round({ armourPiercing: "ap" }))).toBe("AP");
    expect(kindOfRound(round({ armourPiercing: "sap" }))).toBe("AP");
    // The file, not the name: a name that says armour-piercing is not enough.
    expect(kindOfRound(round({ name: "500 kg PD500 armor-piercing bomb" }))).toBe("GP");
    expect(kindOfRound(round({ category: "guidedBomb", stats: { guidance: "tv" } }))).toBe("TV");
    expect(kindOfRound(round({ category: "guidedBomb", stats: { aiming: "manual" } }))).toBe("RC");
    expect(kindOfRound(round({ category: "aam" }))).toBe("AAM");
  });
});

describe("massLabelOf", () => {
  it("writes pounds where the game's file states them", () => {
    expect(massLabelOf(240.9, 531)).toBe("531 lb");
    expect(massLabelOf(710, undefined)).toBe("710 kg");
  });
});
