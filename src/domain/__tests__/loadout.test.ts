import { describe, expect, it } from "vitest";
import {
  applyDrop,
  blockedIn,
  bombsIn,
  equivalentOption,
  massOf,
  unmetIn,
  unpricedIn,
  violationsOf,
  weaponDamageOf,
  type Armament,
  type Build,
  type SlotOption,
  type Store,
} from "../loadout";

const store = (over: Partial<Store> & { name: string }): Store => ({
  short: null,
  massKg: 100,
  kind: "bomb",
  bomb: null,
  holds: over.bomb?.count ?? 1,
  iconType: null,
  damage: null,
  ...over,
});

const option = (over: Partial<SlotOption> & { name: string }): SlotOption => ({
  stores: [],
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
        option({
          name: "500lb",
          stores: [{ store: store({ name: "500 lb bomb", massKg: 240, bomb: { id: "mk82", count: 1 } }), count: 1 }],
        }),
        option({
          // One rack holding six, which is one store carrying six bombs.
          name: "500lb_x6",
          stores: [{ store: store({ name: "six-rack", massKg: 1445, bomb: { id: "mk82", count: 6 } }), count: 1 }],
        }),
      ],
    },
    {
      index: 2,
      options: [
        option({
          name: "250lb",
          stores: [{ store: store({ name: "250 lb bomb", massKg: 118, bomb: { id: "mk81", count: 1 } }), count: 1 }],
        }),
        option({
          name: "jdam",
          stores: [{ store: store({ name: "GBU-38 JDAM", massKg: 253, bomb: null }), count: 1 }],
        }),
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

describe("weaponDamageOf", () => {
  const priced: Armament = {
    ...armament,
    hardpoints: [
      {
        index: 1,
        options: [
          option({
            name: "rack",
            stores: [{ store: store({ name: "six-rack", damage: 14783 }), count: 2 }],
          }),
        ],
      },
      {
        index: 2,
        options: [option({ name: "gun", stores: [{ store: store({ name: "gun pod", kind: "gun" }), count: 1 }] })],
      },
    ],
  };

  it("sums the game's price for each store as many times as it is hung", () => {
    expect(weaponDamageOf(build([[1, "rack"]]), priced)).toBe(29566);
  });

  it("counts what the game doesn't price as nothing", () => {
    expect(weaponDamageOf(build([[1, "rack"], [2, "gun"]]), priced)).toBe(29566);
    expect(weaponDamageOf(build([[2, "gun"]]), priced)).toBe(0);
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

describe("dragging a choice between pylons", () => {
  const mk82 = store({ name: "Mk 82", massKg: 240, bomb: { id: "mk82", count: 1 } });
  const mk84 = store({ name: "Mk 84", massKg: 900, bomb: { id: "mk84", count: 1 } });
  const jdam = store({ name: "GBU-38", massKg: 253 });
  /**
   * Four stations: the inner one names its Mk 82 differently, the way the game
   * does, and the outer one takes a JDAM the others can't. An Mk 82 on 2 rules
   * out an Mk 84 on 3.
   */
  const wing: Armament = {
    maxLoadKg: 2000,
    perWingKg: null,
    disbalanceKg: null,
    hardpoints: [
      { index: 1, options: [option({ name: "mk82_inner", stores: [{ store: mk82, count: 1 }] }), option({ name: "mk84", stores: [{ store: mk84, count: 1 }] })] },
      { index: 2, options: [option({ name: "mk82", stores: [{ store: mk82, count: 1 }] })] },
      { index: 3, options: [option({ name: "mk82", stores: [{ store: mk82, count: 1 }] }), option({ name: "mk84", stores: [{ store: mk84, count: 1 }] })] },
      { index: 4, options: [option({ name: "jdam", stores: [{ store: jdam, count: 1 }] }), option({ name: "mk82", stores: [{ store: mk82, count: 1 }] })] },
    ],
    exclusions: [{ slot: 2, option: "mk82", otherSlot: 3, otherOption: "mk84" }],
    dependencies: [],
  };
  const fromPylon = (slot: number, name: string) => ({ from: "pylon" as const, slot, option: name });
  const fromMenu = (slot: number, name: string) => ({ from: "menu" as const, slot, option: name });

  it("finds the same choice under the same name", () => {
    expect(equivalentOption(wing, 2, "mk82", 3)?.name).toBe("mk82");
  });

  it("finds it under another name when it hangs the same thing", () => {
    expect(equivalentOption(wing, 2, "mk82", 1)?.name).toBe("mk82_inner");
  });

  it("finds nothing on a pylon that can't hang it", () => {
    expect(equivalentOption(wing, 1, "mk84", 4)).toBeNull();
  });

  it("mounts a choice dragged out of the menu, under the target's own name", () => {
    const result = applyDrop(build([]), wing, fromMenu(1, "mk82_inner"), { to: "pylon", slot: 2 });
    expect([...result!.build]).toEqual([[2, "mk82"]]);
  });

  it("moves a choice from one pylon to another", () => {
    const result = applyDrop(build([[1, "mk82_inner"]]), wing, fromPylon(1, "mk82_inner"), { to: "pylon", slot: 3 });
    expect([...result!.build]).toEqual([[3, "mk82"]]);
    expect(result!.displaced).toEqual([]);
  });

  it("swaps two pylons when each can take the other's choice", () => {
    const result = applyDrop(build([[1, "mk82_inner"], [3, "mk84"]]), wing, fromPylon(3, "mk84"), { to: "pylon", slot: 1 });
    expect(new Map(result!.build)).toEqual(new Map([[1, "mk84"], [3, "mk82"]]));
    expect(result!.displaced).toEqual([]);
  });

  it("replaces what can't swap back, and says what came off", () => {
    const result = applyDrop(build([[2, "mk82"], [4, "jdam"]]), wing, fromPylon(2, "mk82"), { to: "pylon", slot: 4 });
    expect([...result!.build]).toEqual([[4, "mk82"]]);
    expect(result!.displaced).toEqual([{ slot: 4, option: "jdam" }]);
  });

  it("refuses a drop the rules bar", () => {
    // Clash: an Mk 82 on 2 rules out the Mk 84 already on 3.
    expect(applyDrop(build([[3, "mk84"]]), wing, fromMenu(2, "mk82"), { to: "pylon", slot: 2 })).toBeNull();
    // Weight: 900 + 900 + 240 is past the 2000 kg limit.
    expect(applyDrop(build([[1, "mk84"], [3, "mk84"]]), wing, fromMenu(4, "mk82"), { to: "pylon", slot: 4 })).toBeNull();
  });

  it("refuses a pylon that can't hang the choice at all", () => {
    expect(applyDrop(build([[1, "mk84"]]), wing, fromPylon(1, "mk84"), { to: "pylon", slot: 4 })).toBeNull();
  });

  it("takes a choice off when it is dropped off the aircraft", () => {
    const result = applyDrop(build([[2, "mk82"]]), wing, fromPylon(2, "mk82"), { to: "remove" });
    expect([...result!.build]).toEqual([]);
    expect(result!.displaced).toEqual([{ slot: 2, option: "mk82" }]);
  });

  it("fills every empty pylon that takes it, skipping those the rules bar", () => {
    const result = applyDrop(build([[3, "mk84"]]), wing, fromMenu(2, "mk82"), { to: "all" });
    // 2 is barred by the Mk 84 on 3, which itself is left alone.
    expect(new Map(result!.build)).toEqual(new Map([[1, "mk82_inner"], [3, "mk84"], [4, "mk82"]]));
  });
});
