import { describe, expect, it } from "vitest";
import modelData from "../../data/base-damage-model.json";
import { buildModel, readCurve, zoneDamage, type BaseDamageModel, type Curve } from "../base-damage";

/** A blast table shaped like explosive.blk's: 25 mm reached at 2 kg of TNT. */
const PENETRATION: Curve = [
  [0.005, 2],
  [0.2, 5],
  [2, 25],
  [25, 65],
  [500, 111],
];
const ZONE = { armorThickness: 25, restrain: 0.6, penetration: PENETRATION };

describe("readCurve", () => {
  it("reads a table the way the game does: straight lines, and the nearest end past either end", () => {
    expect(readCurve(PENETRATION, 1.1)).toBeCloseTo(15, 5);
    expect(readCurve(PENETRATION, 0.001)).toBe(2);
    expect(readCurve(PENETRATION, 9000)).toBe(111);
    expect(readCurve(PENETRATION, 25)).toBe(65);
  });
});

describe("buildModel", () => {
  // The game's own table, sampled the way priced stores happen to fall on it
  // — none of them on its corner at 250 kg.
  const table: Curve = [
    [25, 1100],
    [120, 2500],
    [250, 4200],
    [500, 10000],
  ];
  const priced = [30, 60, 100, 118, 150, 200, 243.71, 255.68, 300, 400, 480].map((tntKg) => ({
    tntKg,
    damage: Math.round(readCurve(table, tntKg)),
  }));

  it("finds the corners between priced stores, rather than cutting across them", () => {
    const model = buildModel(priced, ZONE);
    // 252.45 kg sits just past the corner: a straight line from 243.71 to
    // 255.68 would put it 17 points dear.
    expect(zoneDamage(252.45, model)).toBe(Math.round(readCurve(table, 252.45)));
    expect(model.points.some(([x]) => Math.abs(x - 250) < 0.5)).toBe(true);
  });

  it("gives back every price it was built from", () => {
    const model = buildModel(priced, ZONE);
    for (const { tntKg, damage } of priced) expect(Math.abs(zoneDamage(tntKg, model) - damage)).toBeLessThanOrEqual(1);
  });

  it("takes the step out below the armour, and puts it back", () => {
    // Three small blasts, the lightest unable to pierce 25 mm: priced at 0.6.
    const small = [
      { tntKg: 1, damage: 60 },
      { tntKg: 3, damage: 300 },
      { tntKg: 5, damage: 500 },
    ];
    const model = buildModel(small, ZONE);
    expect(model.points[0]).toEqual([1, 100]);
    expect(zoneDamage(1, model)).toBe(60);
    expect(zoneDamage(1.5, model)).toBe(Math.round(150 * 0.6));
  });
});

describe("the imported model", () => {
  const model = modelData as BaseDamageModel;

  it("reads the bombing zone's armour off the game's own armour class", () => {
    expect(model.armorThickness).toBe(25);
    expect(model.restrain).toBe(0.6);
  });

  it("prices blasts as the game does", () => {
    // Mk 82: 87.1 kg of Comp. H6.
    expect(zoneDamage(117.585, model)).toBe(2464);
    // Mk 84: 428.6 kg of Comp. H6.
    expect(zoneDamage(578.61, model)).toBe(10983);
    // The US HVAR, 3.45 kg of Comp. B.
    expect(zoneDamage(4.52, model)).toBe(380);
  });

  it("reproduces the sheet's own figures for what the game prices nowhere", () => {
    // The Army Type 92 500 kg, just past the 250 kg corner.
    expect(zoneDamage(252.45, model)).toBe(4257);
    // The AGM-123 Skipper, priced by the sheet and not by the game.
    expect(zoneDamage(272.43, model)).toBe(4720);
  });
});
