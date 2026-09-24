import { describe, expect, it } from "vitest";
import { diffData, mergeEntries } from "../../../scripts/changelog/diff";
import type { Aircraft, Bomb } from "../types";

const plane = (over: Partial<Aircraft>): Aircraft => ({
  id: "usa-a",
  name: "A",
  nation: "usa",
  rank: 1,
  br: 1,
  category: "tt-bomber",
  options: [],
  ...over,
});

const bomb = (over: Partial<Bomb>): Bomb =>
  ({
    id: "b",
    chartName: "B",
    fullName: "Bomb B",
    kind: "GP",
    nation: "usa",
    massKg: 100,
    massLabel: "",
    tntKg: 50,
    damageValue: 1000,
    efficiency: null,
    sheetCounts: null,
    usedByNations: ["usa"],
    ...over,
  }) as Bomb;

const label = { date: "2026-09-24", gameVersion: "2.59.0.32" };

describe("diffData", () => {
  it("returns nothing when nothing changed", () => {
    const data = { aircraft: [plane({})], bombs: [bomb({})] };
    expect(diffData(data, data, label)).toBeNull();
  });

  it("labels the entry with the patch it describes", () => {
    const entry = diffData({ aircraft: [], bombs: [] }, { aircraft: [plane({})], bombs: [] }, label);
    expect(entry?.date).toBe("2026-09-24");
    expect(entry?.gameVersion).toBe("2.59.0.32");
  });

  it("lists added and removed aircraft", () => {
    const entry = diffData(
      { aircraft: [plane({ id: "usa-old", name: "Old" })], bombs: [] },
      { aircraft: [plane({ id: "usa-new", name: "New" })], bombs: [] },
      label,
    );
    expect(entry?.aircraft.added).toEqual([{ id: "usa-new", name: "New", nation: "usa" }]);
    expect(entry?.aircraft.removed).toEqual([{ id: "usa-old", name: "Old", nation: "usa" }]);
  });

  it("catches a BR change and a loadout change separately", () => {
    const loadout = { rewardMultiplier: 5, noteMarker: null, note: null, discouraged: false, schedules: [] };
    const entry = diffData(
      { aircraft: [plane({ br: 4.3, options: [loadout] })], bombs: [] },
      { aircraft: [plane({ br: 4.7, options: [{ ...loadout, rewardMultiplier: 6 }] })], bombs: [] },
      label,
    );
    expect(entry?.aircraft.br).toEqual([{ id: "usa-a", name: "A", nation: "usa", from: 4.3, to: 4.7 }]);
    expect(entry?.aircraft.loadouts).toEqual([{ id: "usa-a", name: "A", nation: "usa" }]);
  });

  it("lists added bombs and the values that changed on existing ones", () => {
    const entry = diffData(
      { aircraft: [], bombs: [bomb({ id: "g-p-1000-e", fullName: "1000 lb G.P. Mk.I", damageValue: 3800 })] },
      {
        aircraft: [],
        bombs: [
          bomb({ id: "g-p-1000-e", fullName: "1000 lb G.P. Mk.I", damageValue: 2906 }),
          bomb({ id: "new", fullName: "New bomb" }),
        ],
      },
      label,
    );
    expect(entry?.bombs.added).toEqual([{ id: "new", name: "New bomb" }]);
    expect(entry?.bombs.changed).toEqual([
      { id: "g-p-1000-e", name: "1000 lb G.P. Mk.I", fields: [{ field: "damageValue", from: 3800, to: 2906 }] },
    ]);
  });
});

describe("mergeEntries", () => {
  const entry = (over: { br?: { from: number; to: number }[]; damage?: [number, number] }) =>
    diffData(
      {
        aircraft: (over.br ?? []).map((b, i) => plane({ id: `usa-${i}`, br: b.from })),
        bombs: over.damage ? [bomb({ damageValue: over.damage[0] })] : [],
      },
      {
        aircraft: (over.br ?? []).map((b, i) => plane({ id: `usa-${i}`, br: b.to })),
        bombs: over.damage ? [bomb({ damageValue: over.damage[1] })] : [],
      },
      label,
    )!;

  it("keeps a patch's earlier changes and adds the later ones", () => {
    const merged = mergeEntries(entry({ damage: [3800, 2906] }), entry({ br: [{ from: 5, to: 4.7 }] }));
    expect(merged?.bombs.changed).toHaveLength(1);
    expect(merged?.aircraft.br).toEqual([{ id: "usa-0", name: "A", nation: "usa", from: 5, to: 4.7 }]);
  });

  it("reads a value changed twice from its first to its last", () => {
    const merged = mergeEntries(entry({ damage: [3800, 3000] }), entry({ damage: [3000, 2906] }));
    expect(merged?.bombs.changed[0].fields).toEqual([{ field: "damageValue", from: 3800, to: 2906 }]);
  });

  it("drops a change that ends where it started", () => {
    expect(mergeEntries(entry({ br: [{ from: 5, to: 4.7 }] }), entry({ br: [{ from: 4.7, to: 5 }] }))).toBeNull();
  });
});
