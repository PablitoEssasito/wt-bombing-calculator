import { describe, expect, it } from "vitest";
import armamentData from "../../data/armament.json";

/**
 * The compact shape `src/lib/dataset.ts` expects — duplicated rather than
 * imported so this test still catches a change to that shape breaking the
 * consumer, instead of both sides silently agreeing to something wrong.
 */
type Data = {
  files: string[];
  stores: { n: string | null; kg: number | null; k: string; b?: (string | number)[] }[];
  units: Record<string, { slots: { i: number; o: { n: string; w: number | [number, number][] }[] }[] }>;
};

// TypeScript reads the literal shape of a JSON import, which cannot line up with
// the tuples above on its own.
const data = armamentData as unknown as Data;

const storesOf = (option: { w: number | [number, number][] }) =>
  typeof option.w === "number" ? [[option.w, 1] as [number, number]] : option.w;

/**
 * How many of a store a choice hangs comes from two different statements in the
 * game's files, and telling them apart is the whole difficulty.
 *
 * Separate mounting points are a physical count: a Tu-95M's bomb bay is written
 * as six entries of one FAB-250 each, and reading that as one bomb offers a
 * loadout nobody can fly. The `bullets` field beside a reference is a physical
 * count only on a rack or a rail, and ammunition on anything else — a BK-27
 * states 150 of itself, meaning its magazine.
 *
 * Both of those were wrong here at different times, in opposite directions, so
 * both are pinned.
 */
describe("armament.json: how many a hardpoint choice hangs", () => {
  it("counts a bomb bay's stations, not one bomb", () => {
    const bay = data.units.tu_95m?.slots.find((s) => s.i === 1);
    const six = bay?.o.find((o) => o.n === "fab_250_x6");
    expect(six).toBeDefined();

    const [[index, count]] = storesOf(six!);
    expect(data.stores[index].n).toContain("FAB-250");
    expect(count).toBe(6);
  });

  it("never mistakes a magazine for a stack of gun pods", () => {
    // Real multi-gun pods exist — the F-82E's centreline pod carries eight —
    // but ammunition figures start at 20 rounds and climb past 2,000, so
    // anything in that range has leaked through as a count.
    const offenders: string[] = [];

    for (const [unitId, unit] of Object.entries(data.units)) {
      for (const slot of unit.slots) {
        for (const option of slot.o) {
          for (const [index, count] of storesOf(option)) {
            const store = data.stores[index];
            if (count > 12 && ["gun", "countermeasure"].includes(store.k)) {
              offenders.push(`${unitId} slot ${slot.i} "${option.n}": ${count} × ${store.n}`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the BK-27 gun pod a single cannon", () => {
    const bk27 = data.files.indexOf("cannon_mauser_bk_27");
    expect(bk27).toBeGreaterThanOrEqual(0);

    const gunPod = data.units.alpha_jet_a?.slots.find((s) => s.i === 3)?.o.find((o) => o.n === "gun_pod");
    expect(gunPod).toBeDefined();
    // A bare index is shorthand for "one of these" — one physical cannon,
    // whatever its magazine holds.
    expect(gunPod!.w).toBe(bk27);
  });
});
