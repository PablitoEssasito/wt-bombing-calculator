import { describe, expect, it } from "vitest";
import {
  blockedIn,
  bombsIn,
  massOf,
  munitionsIn,
  unmetIn,
  unpricedIn,
  violationsOf,
  type Armament,
  type Build,
  type Store,
} from "../loadout";

const store = (over: Partial<Store> & { name: string }): Store => ({
  short: null,
  massKg: 100,
  kind: "bomb",
  bomb: null,
  holds: over.bomb?.count ?? 1,
  iconType: null,
  ...over,
});

/**
 * A pylon aircraft cut down to what the rules need: two wing stations and a
 * rack. The limit is generous on purpose, so the exclusion tests below never
 * incidentally trip a mass block too — the mass tests set their own limit.
 */
const armament: Armament = {
  maxLoadKg: 5000,
  perWingKg: 500,
  disbalanceKg: 300,
  hardpoints: [
    {
      index: 1,
      options: [
        {
          name: "500lb",
          stores: [{ store: store({ name: "500 lb bomb", massKg: 240, bomb: { id: "mk82", count: 1 } }), count: 1 }],
        },
        {
          // One rack holding six, which is one store carrying six bombs.
          name: "500lb_x6",
          stores: [{ store: store({ name: "six-rack", massKg: 1445, bomb: { id: "mk82", count: 6 } }), count: 1 }],
        },
      ],
    },
    {
      index: 2,
      options: [
        {
          name: "250lb",
          stores: [{ store: store({ name: "250 lb bomb", massKg: 118, bomb: { id: "mk81", count: 1 } }), count: 1 }],
        },
        {
          name: "jdam",
          stores: [{ store: store({ name: "GBU-38 JDAM", massKg: 253, bomb: null }), count: 1 }],
        },
      ],
    },
  ],
  // Stated one way only, as four fifths of the game's rules are.
  exclusions: [{ slot: 1, option: "500lb", otherSlot: 2, otherOption: "250lb" }],
  dependencies: [{ slot: 2, option: "jdam", needsSlot: 1, needsOption: "500lb_x6" }],
};

const build = (entries: [number, string][]): Build => new Map(entries);

describe("massOf", () => {
  it("adds up what the hardpoints are holding", () => {
    expect(massOf(build([[1, "500lb"], [2, "250lb"]]), armament)).toBe(358);
  });

  it("weighs a rack as the rack, not as one bomb", () => {
    expect(massOf(build([[1, "500lb_x6"]]), armament)).toBe(1445);
  });

  it("ignores a choice the aircraft does not offer", () => {
    expect(massOf(build([[1, "nonsense"]]), armament)).toBe(0);
  });
});

describe("violationsOf", () => {
  it("passes a build within the limits", () => {
    expect(violationsOf(build([[1, "500lb"], [2, "jdam"]]), armament)).toEqual([]);
  });

  it("reports a build heavier than the airframe lifts", () => {
    const cramped = { ...armament, maxLoadKg: 1000 };
    expect(violationsOf(build([[1, "500lb_x6"]]), cramped)).toEqual([
      { kind: "overweight", kg: 1445, limitKg: 1000 },
    ]);
  });

  it("catches an excluded pair however the rule was written", () => {
    // The rule names slot 1 first; choosing slot 2 first must still catch it.
    const forwards = violationsOf(build([[1, "500lb"], [2, "250lb"]]), armament);
    const backwards = violationsOf(build([[2, "250lb"], [1, "500lb"]]), armament);

    expect(forwards).toHaveLength(1);
    expect(backwards).toHaveLength(1);
    expect(forwards[0].kind).toBe("excluded");
  });
});

describe("blockedIn", () => {
  it("greys out what the rest of the build rules out, and says which pylon did it", () => {
    expect([...blockedIn(armament, build([[1, "500lb"]]), 2)]).toEqual([
      ["250lb", { reason: "clash", withSlot: 1, withOption: "500lb" }],
    ]);
  });

  it("blocks in the unwritten direction too", () => {
    // Nothing in the data says the 250 bars the 500; it has to be read as mutual.
    expect([...blockedIn(armament, build([[2, "250lb"]]), 1).keys()]).toEqual(["500lb"]);
  });

  it("does not block a hardpoint against itself", () => {
    expect([...blockedIn(armament, build([[1, "500lb"]]), 1).keys()]).toEqual([]);
  });

  it("blocks nothing on an empty aircraft", () => {
    expect([...blockedIn(armament, build([]), 2).keys()]).toEqual([]);
  });

  it("greys out every choice that would push the build past the airframe's limit", () => {
    // The rack alone is 1445 kg, already over this test's 1000 kg maxLoadKg —
    // nothing on the other hardpoint can be added on top of it.
    const cramped = { ...armament, maxLoadKg: 1000 };
    const blocked = blockedIn(cramped, build([[1, "500lb_x6"]]), 2);

    expect([...blocked.keys()]).toEqual(["250lb", "jdam"]);
    expect(blocked.get("250lb")).toEqual({ reason: "weight", overBy: 563 });
  });

  it("does not block a choice the current slot itself is already carrying", () => {
    // Re-selecting slot 1's own heavy option must not count itself twice —
    // otherwise a 1445 kg rack under a 1445 kg limit would grey itself out.
    const exact = { ...armament, maxLoadKg: 1445 };
    expect([...blockedIn(exact, build([[1, "500lb_x6"]]), 1).keys()]).toEqual([]);
  });
});

describe("munitionsIn", () => {
  it("counts what a rack holds, not the rack", () => {
    const rack = armament.hardpoints[0].options.find((o) => o.name === "500lb_x6")!;
    expect(munitionsIn(rack)).toBe(6);
  });

  it("counts one for a single store the chart cannot price", () => {
    const jdam = armament.hardpoints[1].options.find((o) => o.name === "jdam")!;
    expect(munitionsIn(jdam)).toBe(1);
  });

  it("counts a rail's rounds even when the chart prices none of them", () => {
    // A twin R-60M rail is two missiles, whatever the bomb chart thinks of them.
    const rail = {
      name: "r60m_x2",
      stores: [{ store: store({ name: "R-60M air-to-air missiles", kind: "missile", massKg: 88, holds: 2 }), count: 1 }],
    };
    expect(munitionsIn(rail)).toBe(2);
  });
});

describe("bombsIn", () => {
  it("counts a rack's bombs, not the rack", () => {
    expect(bombsIn(build([[1, "500lb_x6"]]), armament)).toEqual([{ bombId: "mk82", count: 6 }]);
  });

  it("collapses the same bomb hung in several places", () => {
    const two: Armament = {
      ...armament,
      hardpoints: [armament.hardpoints[0], { ...armament.hardpoints[0], index: 3 }],
    };
    expect(bombsIn(build([[1, "500lb"], [3, "500lb_x6"]]), two)).toEqual([
      { bombId: "mk82", count: 7 },
    ]);
  });

  it("leaves out what the chart does not price", () => {
    expect(bombsIn(build([[2, "jdam"]]), armament)).toEqual([]);
  });
});

describe("unpricedIn", () => {
  it("names the bombs carried that nothing can count", () => {
    expect(unpricedIn(build([[2, "jdam"]]), armament).map((s) => s.name)).toEqual(["GBU-38 JDAM"]);
  });

  it("says nothing about ordnance the chart does price", () => {
    expect(unpricedIn(build([[1, "500lb"]]), armament)).toEqual([]);
  });
});

describe("unmetIn", () => {
  it("flags a choice whose dependency is not in the build", () => {
    expect(unmetIn(build([[2, "jdam"]]), armament)).toEqual([
      { slot: 2, option: "jdam", needsSlot: 1, needsOption: "500lb_x6" },
    ]);
  });

  it("says nothing once the dependency is met", () => {
    expect(unmetIn(build([[1, "500lb_x6"], [2, "jdam"]]), armament)).toEqual([]);
  });

  it("says nothing about a choice with no dependency of its own", () => {
    expect(unmetIn(build([[1, "500lb"]]), armament)).toEqual([]);
  });

  it("is never blocked on — a build can carry an unmet dependency", () => {
    expect(violationsOf(build([[2, "jdam"]]), armament)).toEqual([]);
  });
});
