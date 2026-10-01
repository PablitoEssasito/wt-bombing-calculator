import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import carrierData from "../../data/carriers.json";
import { rebindPlans } from "../../../scripts/armament/rebind";
import type { Aircraft, Bomb, BombKind } from "../types";

const bomb = (id: string, chartName: string, kind: BombKind, massKg: number | null, extra: Partial<Bomb> = {}): Bomb =>
  ({ id, chartName, fullName: chartName, kind, massKg, damageValue: 100, ...extra }) as Bomb;

const BOMBS = [
  bomb("m8", "M8", "ROCKET", 17.3),
  bomb("m-8", "M-8", "ROCKET", 7.8),
  bomb("fc1000", "FC1000", "INC", null),
  bomb("sc50", "SC50", "GP", 50),
  bomb("an-m65a1", "AN-M65A1", "GP", 500),
  bomb("g-p-1000-e", "G.P.1000(e)", "GP", 496),
  bomb("g-p-1000-l", "G.P.1000(l)", "GP", 496, { aliasOf: "g-p-1000-e" }),
  bomb("g-p-500", "G.P.500", "GP", 226),
];

const plane = (items: { bombId: string; count: number; sheetName?: string }[]): Aircraft =>
  ({
    id: "p",
    name: "Plane",
    options: [{ schedules: [{ baseHp: 10000, bases: [{ items }], basesDestroyed: 1 }] }],
  }) as unknown as Aircraft;

const itemsOf = (result: { aircraft: Aircraft[] }) => result.aircraft[0].options[0].schedules[0].bases[0].items;

describe("rebindPlans", () => {
  it("keeps a bomb the aircraft hangs", () => {
    const result = rebindPlans([plane([{ bombId: "sc50", count: 3 }])], BOMBS, () => new Set(["sc50"]));
    expect(itemsOf(result)).toEqual([{ bombId: "sc50", count: 3 }]);
    expect(result.changes).toEqual([]);
  });

  it("takes the carried weapon going by the sheet's name, keeping the sheet's in sheetBombId", () => {
    // The Su-6's rockets: the sheet's "M8" is the American rocket, the aircraft hangs the Soviet M-8.
    const result = rebindPlans([plane([{ bombId: "m8", count: 10 }])], BOMBS, () => new Set(["m-8", "sc50"]));
    expect(itemsOf(result)).toEqual([{ bombId: "m-8", count: 10, sheetBombId: "m8" }]);
  });

  it("else the carried weapon of that kind nearest in mass", () => {
    // The British Corsair's only 1000-pounder is the G.P. Mk.I.
    const result = rebindPlans([plane([{ bombId: "an-m65a1", count: 1 }])], BOMBS, () => new Set(["g-p-1000-e", "g-p-500"]));
    expect(itemsOf(result)).toEqual([{ bombId: "g-p-1000-e", count: 1, sheetBombId: "an-m65a1" }]);
  });

  it("reads a sheet row standing in for a game weapon as that weapon", () => {
    const result = rebindPlans([plane([{ bombId: "g-p-1000-l", count: 2 }])], BOMBS, () => new Set(["g-p-1000-e"]));
    expect(itemsOf(result)).toEqual([{ bombId: "g-p-1000-e", count: 2, sheetBombId: "g-p-1000-l" }]);
  });

  it("drops what the game has no weapon for", () => {
    const result = rebindPlans(
      [plane([{ bombId: "fc1000", count: 1 }, { bombId: "sc50", count: 3 }])],
      BOMBS,
      () => new Set(["sc50"]),
    );
    expect(itemsOf(result)).toEqual([{ bombId: "sc50", count: 3 }]);
    expect(result.changes).toHaveLength(1);
  });

  it("leaves an aircraft with no flight model read alone", () => {
    const result = rebindPlans([plane([{ bombId: "m8", count: 10 }])], BOMBS, () => undefined);
    expect(itemsOf(result)).toEqual([{ bombId: "m8", count: 10 }]);
  });

  it("places a weapon the sheet's chart has no row for among what the aircraft hangs, by its name", () => {
    const missiles = [...BOMBS, bomb("agm-65f", "AGM-65F", "AGM", 303), bomb("agm-65e", "AGM-65E", "AGM", 293)];
    const result = rebindPlans(
      [plane([{ bombId: "sc50", count: 2 }, { bombId: "agm-65f", count: 2, sheetName: "AGM-65F" }])],
      missiles,
      () => new Set(["sc50", "agm-65e", "agm-65f"]),
    );
    expect(itemsOf(result)).toEqual([
      { bombId: "sc50", count: 2 },
      { bombId: "agm-65f", count: 2 },
    ]);
    expect(result.unplaced).toEqual([]);
  });

  it("drops and reports a name neither the sheet's chart nor the aircraft's weapons know", () => {
    const result = rebindPlans(
      [plane([{ bombId: "sc50", count: 2 }, { bombId: "agm-999", count: 2, sheetName: "AGM-999" }])],
      BOMBS,
      () => new Set(["sc50"]),
    );
    expect(itemsOf(result)).toEqual([{ bombId: "sc50", count: 2 }]);
    expect(result.unplaced).toEqual(["Plane: AGM-999"]);
  });

  it("reports such a name on an aircraft with no flight model read, rather than keep it", () => {
    const result = rebindPlans([plane([{ bombId: "agm-65f", count: 2, sheetName: "AGM-65F" }])], BOMBS, () => undefined);
    expect(itemsOf(result)).toEqual([]);
    expect(result.unplaced).toEqual(["Plane: AGM-65F"]);
  });
});

describe("the imported plans", () => {
  it("name only bombs their aircraft hang in the game", () => {
    const carriers = carrierData as Record<string, string[]>;
    const hangs = new Map<string, Set<string>>();
    for (const [bombId, planes] of Object.entries(carriers)) {
      for (const id of planes) hangs.set(id, (hangs.get(id) ?? new Set()).add(bombId));
    }
    const strays = (aircraftData as Aircraft[]).flatMap((a) => {
      const set = hangs.get(a.id);
      if (!set) return [];
      return a.options.flatMap((o) =>
        o.schedules.flatMap((s) => s.bases.flatMap((b) => b.items.filter((i) => !set.has(i.bombId)).map((i) => `${a.id}:${i.bombId}`))),
      );
    });
    expect(strays).toEqual([]);
  });
});
