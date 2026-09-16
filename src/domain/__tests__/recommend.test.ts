import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import bombData from "../../data/bombs.json";
import { reachableBaseHps } from "../base-hp";
import { defaultTarget, pickLoadout, stanceOf, type Candidate } from "../recommend";
import { buildPlan, payloadOf, scheduleFor } from "../schedule";
import type { BaseHp } from "../constants";
import type { Aircraft, Bomb, LoadoutOption } from "../types";

const bombs = new Map((bombData as Bomb[]).map((b) => [b.id, b]));
const aircraft = aircraftData as Aircraft[];

const find = (name: string) => {
  const plane = aircraft.find((a) => a.name === name);
  if (!plane) throw new Error(`no aircraft named ${name}`);
  return plane;
};

/** Everything the planner knows about an aircraft's loadouts in one match. */
function evaluate(plane: Aircraft, baseHp: BaseHp) {
  return plane.options.map((option, index) => {
    const schedule = scheduleFor(option, baseHp);
    const plan = buildPlan(schedule, bombs, { baseHp, mode: "rb", baseCount: 4 });
    return {
      option,
      index,
      basesDestroyed: plan.basesDestroyed,
      bombCount: payloadOf(schedule, bombs).reduce((n, i) => n + i.count, 0),
    };
  });
}

/** What the planner shows before the player touches the bases control. */
function defaultPick(plane: Aircraft, baseHp: BaseHp) {
  const candidates = evaluate(plane, baseHp);
  const reach = Math.max(1, ...candidates.map((c) => c.basesDestroyed));
  return pickLoadout(candidates, Math.min(defaultTarget(candidates, 4), reach));
}

const option = (over: Partial<LoadoutOption> = {}): LoadoutOption => ({
  rewardMultiplier: 5,
  noteMarker: null,
  note: null,
  discouraged: false,
  schedules: [],
  ...over,
});

const candidate = (over: Partial<Candidate> & { option: LoadoutOption }): Candidate => ({
  basesDestroyed: 1,
  bombCount: 4,
  ...over,
});

describe("stanceOf", () => {
  it("reads the star as an endorsement and the note as a refusal", () => {
    expect(stanceOf(option({ noteMarker: "star" }))).toBe("recommended");
    expect(stanceOf(option({ discouraged: true }))).toBe("discouraged");
    expect(stanceOf(option({ noteMarker: "!" }))).toBe("neutral");
  });

  it("does not treat a warning marker alone as a refusal", () => {
    // "!" covers plain tradeoffs too — an unarmed but capable loadout still ranks
    // above one the author tells you not to take.
    expect(stanceOf(option({ noteMarker: "!", discouraged: false }))).toBe("neutral");
  });
});

describe("pickLoadout", () => {
  it("prefers the source's star over a loadout that out-multiplies it", () => {
    const star = candidate({ option: option({ noteMarker: "star", rewardMultiplier: 7.6 }) });
    const richer = candidate({ option: option({ rewardMultiplier: 9.2 }) });
    expect(pickLoadout([richer, star], 1)).toBe(star);
  });

  it("skips a loadout the source argues against when another does the job", () => {
    const refused = candidate({
      option: option({ discouraged: true, rewardMultiplier: 9 }),
      basesDestroyed: 2,
    });
    const plain = candidate({ option: option({ rewardMultiplier: 4 }), basesDestroyed: 2 });
    expect(pickLoadout([refused, plain], 2)).toBe(plain);
  });

  it("falls back to it when nothing else reaches the target", () => {
    const refused = candidate({ option: option({ discouraged: true }), basesDestroyed: 4 });
    const plain = candidate({ option: option(), basesDestroyed: 1 });
    expect(pickLoadout([refused, plain], 4)).toBe(refused);
  });

  it("takes the better multiplier between two the source says nothing about", () => {
    const lean = candidate({ option: option({ rewardMultiplier: 8 }) });
    const heavy = candidate({ option: option({ rewardMultiplier: 6 }) });
    expect(pickLoadout([heavy, lean], 1)).toBe(lean);
  });
});

describe("defaultTarget", () => {
  it("aims at what the starred loadout does, not at clearing the map", () => {
    const star = candidate({ option: option({ noteMarker: "star" }), basesDestroyed: 1 });
    const heavy = candidate({ option: option(), basesDestroyed: 4 });
    expect(defaultTarget([heavy, star], 4)).toBe(1);
  });

  it("stops short of a base only a refused loadout reaches", () => {
    const refused = candidate({ option: option({ discouraged: true }), basesDestroyed: 2 });
    const plain = candidate({ option: option(), basesDestroyed: 1 });
    expect(defaultTarget([refused, plain], 4)).toBe(1);
  });

  it("still clears the map when nothing is flagged", () => {
    const candidates = [4, 3, 2].map((n) => candidate({ option: option(), basesDestroyed: n }));
    expect(defaultTarget(candidates, 4)).toBe(4);
  });
});

describe("what the planner offers first, against the real sheet", () => {
  it("never leads with a loadout the source argues against", () => {
    const offenders: string[] = [];

    for (const plane of aircraft) {
      if (plane.options.length === 0) continue;
      // Nothing can be done for an aircraft whose every loadout carries the warning.
      if (plane.options.every((o) => o.discouraged)) continue;

      for (const baseHp of reachableBaseHps(plane.br)) {
        if (defaultPick(plane, baseHp).option.discouraged) {
          offenders.push(`${plane.name} @ ${baseHp} HP`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("leads with the starred loadout wherever the source names one", () => {
    const overridden: string[] = [];

    for (const plane of aircraft) {
      if (!plane.options.some((o) => o.noteMarker === "star")) continue;
      for (const baseHp of reachableBaseHps(plane.br)) {
        if (stanceOf(defaultPick(plane, baseHp).option) !== "recommended") {
          overridden.push(`${plane.name} @ ${baseHp} HP`);
        }
      }
    }

    expect(overridden).toEqual([]);
  });

  it("gives the F-15A the light loadout the author points at, not the incendiaries", () => {
    // The sheet's note on the heavy one: "I wouldn't recommend using this loadout
    // as the BLU-27 incendiary bombs have a very low reward multiplier."
    const pick = defaultPick(find("F-15A"), 25900);
    expect(pick.option.discouraged).toBe(false);
    expect(pick.option.noteMarker).toBe("star");
  });

  it("gives the F-5E its one-base loadout, the only one not argued against", () => {
    const pick = defaultPick(find("F-5E"), 25900);
    expect(pick.option.discouraged).toBe(false);
    expect(pick.basesDestroyed).toBe(1);
  });

  it("leaves an aircraft the source never comments on alone", () => {
    // The Pe-8 has one loadout and no note; nothing above should disturb it.
    const pick = defaultPick(find("Pe-8"), 10000);
    expect(pick.index).toBe(0);
    expect(pick.basesDestroyed).toBe(5);
  });
});
