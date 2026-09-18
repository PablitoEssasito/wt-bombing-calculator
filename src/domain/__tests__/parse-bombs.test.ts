import { describe, expect, it } from "vitest";
import { BOMB_COL } from "../../../scripts/etl/config";
import { parseBombs } from "../../../scripts/etl/parse-bombs";

/**
 * One Bomb Chart row, in the tab's own column layout — `BOMB_COL` gives the
 * indices, this fills in the ones a test cares about and leaves the rest
 * blank, the way an ordinary row does for anything past the six count columns.
 */
function bombRow(fields: {
  mass?: string;
  tnt?: string;
  chartName: string;
  fullName: string;
  kind?: string;
  counts?: number[];
  damage: number;
  efficiency?: number;
}): string {
  const row = Array(17).fill("");
  row[BOMB_COL.mass] = fields.mass ?? "";
  row[BOMB_COL.tnt] = fields.tnt ?? "";
  row[BOMB_COL.chartName] = fields.chartName;
  row[BOMB_COL.fullName] = fields.fullName;
  row[BOMB_COL.kind] = fields.kind ?? "GP";
  (fields.counts ?? [1, 2, 3, 4, 5, 6]).forEach((n, i) => (row[BOMB_COL.countsStart + i] = String(n)));
  row[BOMB_COL.damage] = String(fields.damage);
  row[BOMB_COL.efficiency] = fields.efficiency !== undefined ? String(fields.efficiency) : "";
  return row.join(",");
}

const csvOf = (rows: string[]) => rows.join("\n");

describe("parseBombs", () => {
  it("reads a row's mass, kind and per-base counts", () => {
    const csv = csvOf([
      bombRow({
        mass: "110 lb",
        tnt: "50 kg",
        chartName: "Test 100",
        fullName: "100 lb Test bomb",
        kind: "GP",
        damage: 500,
      }),
    ]);
    const { bombs } = parseBombs(csv);
    const bomb = bombs.find((b) => b.chartName === "Test 100")!;

    expect(bomb.massLabel).toBe("110 lb");
    expect(bomb.tntKg).toBeCloseTo(50, 5);
    expect(bomb.kind).toBe("GP");
    expect(bomb.damageValue).toBe(500);
    expect(bomb.sheetCounts).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("splits nation blocks where the damage column drops back down", () => {
    // Climbing damage stays in one block; a drop starts the next nation's.
    const csv = csvOf([
      bombRow({ chartName: "USA Light", fullName: "USA Light bomb", damage: 100 }),
      bombRow({ chartName: "USA Heavy", fullName: "USA Heavy bomb", damage: 200 }),
      bombRow({ chartName: "Germany Light", fullName: "Germany Light bomb", damage: 50 }),
      bombRow({ chartName: "Germany Heavy", fullName: "Germany Heavy bomb", damage: 300 }),
    ]);
    const { bombs, nationBlocks } = parseBombs(csv);

    expect(nationBlocks).toBe(2);
    expect(bombs.find((b) => b.chartName === "USA Light")?.nation).toBe("usa");
    expect(bombs.find((b) => b.chartName === "USA Heavy")?.nation).toBe("usa");
    expect(bombs.find((b) => b.chartName === "Germany Light")?.nation).toBe("germany");
    expect(bombs.find((b) => b.chartName === "Germany Heavy")?.nation).toBe("germany");
  });

  it("skips the header row and any row with no damage value", () => {
    const csv = csvOf([
      bombRow({ chartName: "Chart Name", fullName: "Full Name", damage: 999 }),
      bombRow({ chartName: "Real", fullName: "Real bomb", damage: 400 }),
    ]);
    const { bombs } = parseBombs(csv);

    expect(bombs.some((b) => b.chartName === "Chart Name")).toBe(false);
    expect(bombs.some((b) => b.chartName === "Real")).toBe(true);
  });

  it("resolves an exact chart name globally only when every match hits equally hard", () => {
    // Two nations spell a bomb the same way but disagree on damage — a
    // loadout naming it has no way to know which is meant without its own
    // nation's block to check first (see AMBIGUOUS_DEFAULT_NATION).
    const csv = csvOf([
      bombRow({ chartName: "USA Light", fullName: "USA Light bomb", damage: 100 }),
      bombRow({ chartName: "Mk 77", fullName: "USA Mk 77", damage: 200 }),
      bombRow({ chartName: "Germany Light", fullName: "Germany Light bomb", damage: 50 }),
      bombRow({ chartName: "Mk 77", fullName: "Germany Mk 77", damage: 300 }),
    ]);
    const { global, ambiguous, byNation } = parseBombs(csv);

    expect(global.exact.has("Mk 77")).toBe(false);
    expect(ambiguous.get("mk77")).toHaveLength(2);
    // Each nation's own block still resolves it unambiguously by itself.
    expect(byNation.get("usa")?.exact.get("Mk 77")).toBeDefined();
    expect(byNation.get("germany")?.exact.get("Mk 77")).toBeDefined();
  });

  it("appends the hand-priced rockets and the chart's own missing rows", () => {
    const csv = csvOf([bombRow({ chartName: "Only", fullName: "Only bomb", damage: 100 })]);
    const { bombs } = parseBombs(csv);

    // One chart row, plus everything unpricedBombs() always adds.
    expect(bombs.length).toBeGreaterThan(1);
    expect(bombs.some((b) => b.kind === "ROCKET")).toBe(true);
    expect(bombs.find((b) => b.chartName === "HVAR")?.kind).toBe("ROCKET");
  });
});
