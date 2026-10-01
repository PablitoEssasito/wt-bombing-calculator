import { describe, expect, it } from "vitest";
import type { ChartRow } from "../bomb-chart";
import { columnsFor, compareRows, extrasFor, sortFor, sortKeyOf, TAB_COLUMNS } from "../chart-columns";

const row = (over: Partial<ChartRow>): ChartRow => ({
  id: "x",
  chartName: "X",
  fullName: "X",
  kind: "AAM",
  category: "aam",
  tags: [],
  nation: null,
  massKg: 100,
  massLabel: "100 kg",
  tntKg: 10,
  damageValue: null,
  efficiency: null,
  usedByNations: [],
  ...over,
});

describe("the columns a tab shows", () => {
  it("gives the tabs against a base what it takes to bring one down", () => {
    for (const tab of ["bases", "bomb", "rocket", "all"] as const) {
      expect(TAB_COLUMNS[tab]).toEqual(["needed", "damage", "mass", "tnt", "efficiency", "kind"]);
    }
    expect(TAB_COLUMNS.agm).toEqual(["needed", "damage", "kind", "range", "mass", "tnt"]);
  });

  it("gives air-to-air missiles no damage to a base, and what a pilot picks one by instead", () => {
    expect(TAB_COLUMNS.aamRadar).toEqual(["kind", "seeker", "range", "speed", "loadFactor", "mass"]);
    expect(TAB_COLUMNS.aamIr).toEqual(["aspect", "irccm", "seeker", "range", "speed", "loadFactor", "mass"]);
  });

  it("offers as extra only the columns a tab does not show already, and adds the ones ticked after its own", () => {
    expect(extrasFor("aamIr")).toEqual(["guidanceTime", "warhead", "explosive", "charge"]);
    expect(extrasFor("bomb")).toEqual(["range", "speed", "guidanceTime", "warhead", "explosive", "charge"]);
    expect(columnsFor("aamIr", new Set(["range", "charge"]))).toEqual([...TAB_COLUMNS.aamIr, "charge"]);
  });
});

describe("sortFor", () => {
  it("keeps the sort the page asked for where the tab shows that column", () => {
    expect(sortFor("bomb", "damage", "asc")).toEqual({ sort: "damage", dir: "asc" });
    expect(sortFor("aamIr", "name", "desc")).toEqual({ sort: "name", dir: "desc" });
  });

  it("falls back to the tab's own order where it does not: reach for air-to-air missiles", () => {
    expect(sortFor("aamRadar", "needed", "asc")).toEqual({ sort: "range", dir: "desc" });
    expect(sortFor("other", "needed", "asc")).toEqual({ sort: "name", dir: "asc" });
  });
});

describe("sorting", () => {
  const typeOf = (r: ChartRow) => r.guidance ?? "";

  it("puts all-aspect before rear-aspect, and IRCCM before none, on the way down", () => {
    const all = { bomb: row({ tags: ["ir", "allAspect"] }), needed: null };
    const rear = { bomb: row({ tags: ["ir", "rearAspect"] }), needed: null };
    expect(sortKeyOf(all, "aspect", typeOf)).toBeGreaterThan(sortKeyOf(rear, "aspect", typeOf) as number);
    const proof = { bomb: row({ tags: ["ir", "irccm"] }), needed: null };
    expect(compareRows(proof, rear, "irccm", "desc", typeOf)).toBeLessThan(0);
  });

  it("reads a lock range and a load factor, and leaves a missing one last either way", () => {
    const near = { bomb: row({ chartName: "A", seekerRangeM: 9000, loadFactorMax: 20 }), needed: null };
    const far = { bomb: row({ chartName: "B", seekerRangeM: 25000 }), needed: null };
    const blank = { bomb: row({ chartName: "C" }), needed: null };
    expect(sortKeyOf(far, "seeker", typeOf)).toBe(25000);
    expect(sortKeyOf(near, "loadFactor", typeOf)).toBe(20);
    for (const dir of ["asc", "desc"] as const) {
      expect([blank, far, near].sort((a, b) => compareRows(a, b, "seeker", dir, typeOf)).at(-1)).toBe(blank);
    }
  });

  it("sorts the type column by the words it shows", () => {
    const a = { bomb: row({ chartName: "A", guidance: "SARH" }), needed: null };
    const b = { bomb: row({ chartName: "B", guidance: "ARH+IOG+DL" }), needed: null };
    expect(compareRows(a, b, "kind", "asc", typeOf)).toBeGreaterThan(0);
  });
});
