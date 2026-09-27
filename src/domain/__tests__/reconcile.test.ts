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

  it("keeps the sheet's price where the game prices nothing, the estimate only reported", () => {
    // The Pe-8's FAB-5000: priced by the game only inside a fixed setup, which the sheet copied.
    const { rows, estimates } = reconcile(
      [row({ damageValue: 30521 })],
      [round({ damage: 31110, damageSource: "estimate" })],
      countryOf,
    );
    expect(rows[0]).toMatchObject({ damageValue: 30521, damageSource: "sheet" });
    expect(estimates).toEqual(["X: sheet 30521, estimate 31110"]);
  });

  it("estimates only where neither the game nor the sheet gives a price", () => {
    const { rows } = reconcile([row({ damageValue: null })], [round({ damage: 2064, damageSource: "estimate" })], countryOf);
    expect(rows[0]).toMatchObject({ damageValue: 2064, damageSource: "estimate" });
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

describe("kindOfRound", () => {
  it("sorts a game-only row by what its file says it is", () => {
    expect(kindOfRound(round({ incendiary: true }))).toBe("INC");
    expect(kindOfRound(round({ drag: true }))).toBe("DRAG");
    expect(kindOfRound(round({ name: "500 kg PD500 armor-piercing bomb" }))).toBe("AP");
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
