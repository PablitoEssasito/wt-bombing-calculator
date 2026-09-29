import { describe, expect, it } from "vitest";
import { fitsSetup, nearestCarried, nearestSetup, splitIntoBases, type Rounds } from "../fit";
import type { Armament, SlotOption } from "../loadout";

const DAMAGE: Record<string, number> = { big: 5, small: 2, dud: 0 };
const damageOf = (bombId: string) => DAMAGE[bombId] ?? 0;
const noVariants = () => false;

const option = (name: string, bombId: string, count: number, massKg: number): SlotOption => ({
  name,
  stores: [
    {
      store: {
        name,
        short: null,
        massKg,
        kind: "bomb",
        bomb: { id: bombId, count },
        holds: count,
        iconType: null,
        damage: null,
      },
      count: 1,
    },
  ],
  iconType: null,
  machLimit: null,
});

/** Two stations for one big bomb or a pair of small ones, a third for one small one. */
const armament = (maxLoadKg: number | null): Armament => ({
  maxLoadKg,
  perWingKg: null,
  disbalanceKg: null,
  hardpoints: [
    { index: 1, options: [option("big", "big", 1, 200), option("small_x2", "small", 2, 100)] },
    { index: 2, options: [option("big", "big", 1, 200), option("small_x2", "small", 2, 100)] },
    { index: 3, options: [option("small", "small", 1, 50)] },
  ],
  exclusions: [],
  dependencies: [],
});

const count = (load: readonly Rounds[], bombId: string) =>
  load.filter((r) => r.bombId === bombId).reduce((n, r) => n + r.count, 0);

/**
 * The most bases, by trying every way to split the rounds into groups — each
 * round joining a group already started or starting one — and counting the
 * groups that bring a base down.
 */
function bruteForce(rounds: number[], threshold: number): number {
  let most = 0;
  const sums: number[] = [];
  const walk = (i: number) => {
    if (i === rounds.length) {
      most = Math.max(most, sums.filter((s) => s >= threshold).length);
      return;
    }
    for (let group = 0; group < sums.length; group++) {
      sums[group] += rounds[i];
      walk(i + 1);
      sums[group] -= rounds[i];
    }
    sums.push(rounds[i]);
    walk(i + 1);
    sums.pop();
  };
  walk(0);
  return most;
}

describe("splitIntoBases", () => {
  it("brings down as many bases as any way of sharing the rounds out does", () => {
    // A fixed pseudo-random run, so a failure can be reproduced.
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 200; run++) {
      const kinds = 1 + Math.floor(next() * 3);
      const damage = Array.from({ length: kinds }, () => 1 + Math.floor(next() * 9));
      const counts = Array.from({ length: kinds }, () => 1 + Math.floor(next() * 3));
      const threshold = 5 + Math.floor(next() * 10);
      const load = counts.map((c, k) => ({ bombId: `b${k}`, count: c }));
      const of = (id: string) => damage[Number(id.slice(1))];
      const split = splitIntoBases(load, of, threshold, Infinity);

      const rounds = counts.flatMap((c, k) => Array.from({ length: c }, () => damage[k]));
      expect(split.bases.length, JSON.stringify({ damage, counts, threshold })).toBe(bruteForce(rounds, threshold));
      for (const base of split.bases) {
        const sum = base.reduce((s, r) => s + of(r.bombId) * r.count, 0);
        expect(sum).toBeGreaterThanOrEqual(threshold);
        // Every round on a base is needed there.
        for (const r of base) expect(sum - of(r.bombId)).toBeLessThan(threshold);
      }
      const shared = [...split.bases.flat(), ...split.leftover];
      counts.forEach((c, k) => expect(count(shared, `b${k}`)).toBe(c));
    }
  });

  it("counts no more than the cap, leaving the rest over", () => {
    const split = splitIntoBases([{ bombId: "big", count: 4 }], damageOf, 5, 2);
    expect(split.bases).toEqual([[{ bombId: "big", count: 1 }], [{ bombId: "big", count: 1 }]]);
    expect(split.leftover).toEqual([{ bombId: "big", count: 2 }]);
  });

  it("never puts a round that does no damage on a base", () => {
    const split = splitIntoBases(
      [
        { bombId: "big", count: 1 },
        { bombId: "dud", count: 3 },
      ],
      damageOf,
      5,
      Infinity,
    );
    expect(split.bases).toEqual([[{ bombId: "big", count: 1 }]]);
    expect(split.leftover).toEqual([{ bombId: "dud", count: 3 }]);
  });
});

describe("nearestCarried", () => {
  it("gives up the least damage for a load the stations take exactly", () => {
    // Three big bombs for two big stations: one comes off, and the third
    // station takes one of the two small ones — a pair would need a big station.
    const fit = nearestCarried(
      armament(null),
      [
        { bombId: "big", count: 3 },
        { bombId: "small", count: 2 },
      ],
      noVariants,
      damageOf,
      5,
      Infinity,
    )!;
    expect(fit.load).toEqual([
      { bombId: "big", count: 2 },
      { bombId: "small", count: 1 },
    ]);
    expect(fit.split.bases).toHaveLength(2);
  });

  it("keeps under the load limit", () => {
    const fit = nearestCarried(
      armament(400),
      [
        { bombId: "big", count: 3 },
        { bombId: "small", count: 2 },
      ],
      noVariants,
      damageOf,
      5,
      Infinity,
    )!;
    expect(fit.load).toEqual([{ bombId: "big", count: 2 }]);
  });

  it("never names a bomb or a count the plan does not", () => {
    const load = [
      { bombId: "big", count: 1 },
      { bombId: "small", count: 7 },
    ];
    const fit = nearestCarried(armament(null), load, noVariants, damageOf, 5, Infinity)!;
    for (const r of fit.load) expect(r.count).toBeLessThanOrEqual(count(load, r.bombId));
  });

  it("finds nothing where not one round can be hung", () => {
    expect(nearestCarried(armament(null), [{ bombId: "dud", count: 2 }], noVariants, damageOf, 5, Infinity)).toBeNull();
  });
});

describe("fitsSetup", () => {
  const forged = (id: string, of: string) => id === "forged" && of === "plain";

  it("lets a variant make up a bomb the setup hangs too few of", () => {
    expect(
      fitsSetup(
        [
          { bombId: "plain", count: 2 },
          { bombId: "forged", count: 8 },
        ],
        [{ bombId: "plain", count: 10 }],
        forged,
      ),
    ).toBe(true);
  });

  it("does not count one setup's rounds towards two of the load's bombs", () => {
    expect(
      fitsSetup(
        [{ bombId: "forged", count: 8 }],
        [
          { bombId: "plain", count: 8 },
          { bombId: "forged", count: 2 },
        ],
        forged,
      ),
    ).toBe(false);
  });
});

describe("nearestSetup", () => {
  const setups = [[{ bombId: "small", count: 8 }], [{ bombId: "big", count: 1 }], [{ bombId: "big", count: 2 }]];

  it("takes the setup that brings down the most bases", () => {
    const fit = nearestSetup(setups, [{ bombId: "big", count: 4 }], damageOf, 16, Infinity)!;
    expect(fit.load).toEqual([{ bombId: "small", count: 8 }]);
    expect(fit.split.bases).toHaveLength(1);
  });

  it("between as many bases, takes the one nearest the plan in damage", () => {
    // Both bring one base of 5 down; the plan's 12 is nearer 10 than 5.
    const fit = nearestSetup(setups.slice(1), [{ bombId: "small", count: 6 }], damageOf, 5, 1)!;
    expect(fit.load).toEqual([{ bombId: "big", count: 2 }]);
  });

  it("names the other setups that do as well, and none that do worse", () => {
    const twice = [...setups, [{ bombId: "big", count: 2 }]];
    const fit = nearestSetup(twice, [{ bombId: "small", count: 6 }], damageOf, 5, 1)!;
    expect(fit.load).toEqual([{ bombId: "big", count: 2 }]);
    // Eight small ones (16) and one big one (5) bring one base down too; the same setup twice is one.
    expect(fit.alternatives.map((a) => a.load)).toEqual([[{ bombId: "small", count: 8 }], [{ bombId: "big", count: 1 }]]);
    expect(nearestSetup(setups, [{ bombId: "big", count: 4 }], damageOf, 16, Infinity)!.alternatives).toEqual([]);
  });

  it("offers nothing beside a setup that brings no base down", () => {
    const fit = nearestSetup(setups, [{ bombId: "big", count: 9 }], damageOf, 100, Infinity)!;
    expect(fit.split.bases).toEqual([]);
    expect(fit.alternatives).toEqual([]);
  });
});
