import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import bombData from "../../data/bombs.json";
import { BASE_HP_TIERS } from "../constants";
import { buildPlan, mountedIn, payloadOf, trimToTarget } from "../schedule";
import type { Aircraft, Bomb } from "../types";

const bombs = new Map((bombData as Bomb[]).map((b) => [b.id, b]));
const aircraft = aircraftData as Aircraft[];

const find = (id: string) => {
  const plane = aircraft.find((a) => a.id === id);
  if (!plane) throw new Error(`no aircraft ${id}`);
  return plane;
};

/** The Pe-8 carries a single preset of 40 FAB-100sv, which makes it easy to reason about. */
const pe8 = () => find("ussr-pe-8");

describe("payloadOf", () => {
  it("collapses a schedule back into the bombs actually carried", () => {
    const schedule = pe8().options[0].schedules[0];
    expect(payloadOf(schedule, bombs)).toEqual([
      { bomb: bombs.get("100sv"), count: 40 },
    ]);
  });
});

describe("buildPlan under the conditions the source assumes", () => {
  it("returns the sheet's own numbers untouched", () => {
    const schedule = pe8().options[0].schedules[0];
    const plan = buildPlan(schedule, bombs, { baseHp: 10000, mode: "rb", baseCount: 4 });

    expect(plan.source).toBe("sheet");
    expect(plan.basesDestroyed).toBe(5);
    expect(plan.bases).toHaveLength(5);
    expect(plan.bases.every((b) => b.items[0].count === 8)).toBe(true);
    expect(plan.bases.every((b) => b.destroys)).toBe(true);
  });

  it("keeps the uneven uptier schedule the source wrote by hand", () => {
    // Eight per base is more than the maths needs, because the Pe-8 can only
    // take the bombs in one fixed block of forty.
    const uptier = pe8().options[0].schedules[1];
    expect(uptier.baseHp).toBe(16000);

    const plan = buildPlan(uptier, bombs, { baseHp: 16000, mode: "rb", baseCount: 4 });
    expect(plan.source).toBe("sheet");
    expect(plan.bases.map((b) => b.items[0].count)).toEqual([12, 12, 12, 4]);
    expect(plan.basesDestroyed).toBe(3);
  });
});

describe("buildPlan when conditions differ", () => {
  it("redistributes the same payload against arcade's tougher bases", () => {
    const schedule = pe8().options[0].schedules[0];
    const plan = buildPlan(schedule, bombs, { baseHp: 10000, mode: "ab", baseCount: 4 });

    expect(plan.source).toBe("recomputed");
    expect(plan.effectiveHp).toBe(20000);
    // Forty bombs, thirteen to a base at 20 000 HP, so three bases and one spare.
    expect(plan.bases).toHaveLength(3);
    expect(plan.bases.every((b) => b.items[0].count === 13)).toBe(true);
    expect(plan.leftover).toEqual([{ bomb: bombs.get("100sv"), count: 1 }]);
  });

  it("stops at the map's base count where bases do not respawn", () => {
    const schedule = pe8().options[0].schedules[0];
    const plan = buildPlan(schedule, bombs, { baseHp: 10000, mode: "rb", baseCount: 3 });

    // Half health means four bombs a base, so the payload could cover ten — but a
    // three-base map has only three, and they never come back.
    expect(plan.basesDestroyed).toBe(3);
    expect(plan.respawns).toBe(false);
    expect(plan.leftover[0].count).toBe(28);
  });

  it("never claims a base it cannot finish, under any conditions", () => {
    const conditions = BASE_HP_TIERS.flatMap((baseHp) =>
      (["rb", "ab"] as const).flatMap((mode) =>
        ([3, 4] as const).map((baseCount) => ({ baseHp, mode, baseCount })),
      ),
    );

    for (const plane of aircraft) {
      for (const option of plane.options) {
        for (const schedule of option.schedules) {
          for (const setup of conditions) {
            const plan = buildPlan(schedule, bombs, setup);

            if (plan.source === "recomputed") {
              // Everything we lay out ourselves has to actually flatten its base;
              // whatever cannot is leftovers, not a base.
              for (const base of plan.bases) {
                expect(base.damage).toBeGreaterThanOrEqual(plan.threshold);
                expect(base.destroys).toBe(true);
              }
            } else {
              // The source lists spare bases past the ones it counts, to say where
              // to dump what is left, and its own count is what marks a base as
              // down here.
              plan.bases.forEach((base, i) => {
                expect(base.destroys).toBe(i < plan.basesDestroyed);
              });
            }

            // Non-respawning maps cannot offer more bases than they have.
            if (!plan.respawns) {
              expect(plan.bases.length).toBeLessThanOrEqual(setup.baseCount);
            }
          }
        }
      }
    }
  });

  it("never invents ordnance the aircraft was not carrying", () => {
    for (const plane of aircraft.slice(0, 120)) {
      for (const option of plane.options) {
        for (const schedule of option.schedules) {
          const carried = new Map(payloadOf(schedule, bombs).map((i) => [i.bomb.id, i.count]));
          const plan = buildPlan(schedule, bombs, {
            baseHp: schedule.baseHp,
            mode: "ab",
            baseCount: 4,
          });

          const used = new Map<string, number>();
          for (const item of [...plan.bases.flatMap((b) => b.items), ...plan.leftover]) {
            used.set(item.bomb.id, (used.get(item.bomb.id) ?? 0) + item.count);
          }
          for (const [id, count] of used) {
            expect(count).toBeLessThanOrEqual(carried.get(id) ?? 0);
          }
        }
      }
    }
  });
});

describe("trimToTarget", () => {
  /** The AU-1 has a single loadout the sheet spreads over three bases. */
  const au1 = () => find("usa-au-1");

  it("cuts the payload down to the bases asked for", () => {
    const schedule = au1().options[0].schedules[0];
    const full = buildPlan(schedule, bombs, { baseHp: 16000, mode: "rb", baseCount: 4 });
    const trimmed = trimToTarget(full, 1);

    expect(full.bases).toHaveLength(3);
    expect(trimmed.bases).toHaveLength(1);
    expect(trimmed.basesDestroyed).toBe(1);
    expect(trimmed.trimmed).toBe(true);

    // Nothing is conjured or lost: what is dropped plus what stays behind is
    // still the whole loadout.
    const before = mountedIn(full).reduce((n, i) => n + i.count, 0);
    const after =
      mountedIn(trimmed).reduce((n, i) => n + i.count, 0) +
      trimmed.leftover.reduce((n, i) => n + i.count, 0);
    expect(after).toBe(before);
  });

  it("leaves a plan that already fits alone", () => {
    const schedule = au1().options[0].schedules[0];
    const full = buildPlan(schedule, bombs, { baseHp: 16000, mode: "rb", baseCount: 4 });

    expect(trimToTarget(full, 2)).toBe(full);
    expect(trimToTarget(full, 9)).toBe(full);
  });

  it("counts untrimmed leftovers as carried, trimmed ones as left behind", () => {
    const schedule = pe8().options[0].schedules[0];
    const arcade = buildPlan(schedule, bombs, { baseHp: 10000, mode: "ab", baseCount: 4 });

    const carried = mountedIn(arcade).reduce((n, i) => n + i.count, 0);
    expect(carried).toBe(40);

    const trimmed = trimToTarget(arcade, 1);
    expect(mountedIn(trimmed).reduce((n, i) => n + i.count, 0)).toBeLessThan(40);
  });
});
