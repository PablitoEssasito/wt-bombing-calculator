import { describe, expect, it } from "vitest";
import armamentData from "../../data/armament.json";

/**
 * The compact shape `src/lib/dataset.ts` expects — duplicated rather than
 * imported so this test still catches a change to that shape breaking the
 * consumer, instead of both sides silently agreeing to something wrong.
 */
type Data = {
  files: string[];
  stores: { n: string | null; kg: number | null; k: string }[];
  units: Record<string, { slots: { i: number; o: { n: string; w: number | [number, number][] }[] }[] }>;
};

const data = armamentData as Data;

/**
 * A hardpoint's repeat count is a physical quantity only when it points at a
 * container — a rack, a rail, a launcher pod. Pointed at a gun or a
 * countermeasure dispenser, the same field in the game's own files is
 * ammunition, and 2,387 hardpoint choices across the roster originally carried
 * that straight through as if it meant "this many gun pods." A BK-27 at 102 kg
 * times a 150-round magazine is a 15,300 kg cannon, which would have poisoned
 * every weight check the loadout creator makes.
 *
 * The pipeline corrects this before the file is written (see
 * `scripts/armament/index.ts`), so nothing at runtime needs to know the
 * difference. This test is the guard that the correction keeps happening: it
 * would have failed outright on the BK-27 before the fix, and stays red on
 * anything reintroducing the bug for guns or dispensers, which the real data
 * confirms are the only kinds a repeat count is never legitimate for.
 */
describe("armament.json: hardpoint repeat counts", () => {
  it("never claims more than one gun or countermeasure at a single choice", () => {
    const offenders: string[] = [];

    for (const [unitId, unit] of Object.entries(data.units)) {
      for (const slot of unit.slots) {
        for (const option of slot.o) {
          if (typeof option.w === "number") continue;
          for (const [index, count] of option.w) {
            const store = data.stores[index];
            if (count > 1 && ["gun", "countermeasure"].includes(store.k)) {
              offenders.push(`${unitId} slot ${slot.i} "${option.n}": ${count} × ${store.n}`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the BK-27 gun pod at its own weight, not its magazine size", () => {
    const bk27 = data.files.indexOf("cannon_mauser_bk_27");
    expect(bk27).toBeGreaterThanOrEqual(0);
    expect(data.stores[bk27].kg).toBeLessThan(200);

    const alphaJet = data.units.alpha_jet_a;
    const gunPod = alphaJet?.slots.find((s) => s.i === 3)?.o.find((o) => o.n === "gun_pod");
    expect(gunPod).toBeDefined();
    // A bare index is shorthand for "one of these" — exactly what a single
    // physical cannon should be, whatever its magazine holds.
    expect(gunPod!.w).toBe(bk27);
  });
});
