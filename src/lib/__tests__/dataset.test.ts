import { describe, expect, it } from "vitest";
import { armamentFor } from "../dataset";

/**
 * `armamentFor` decodes `src/data/armament.json`'s compact shape — stores
 * named once and referred to by index, a bare index standing in for "one of
 * this" — back into what `src/domain/loadout.ts` actually works with. Pinned
 * against real aircraft rather than a hand-built fixture, since the point is
 * to catch the decoder disagreeing with what `scripts/armament/index.ts`
 * actually wrote, which a fixture built by hand could just as easily get
 * wrong the same way.
 */
describe("armamentFor", () => {
  it("returns null for an aircraft the game only offers fixed setups for", () => {
    // The Pe-8 takes one of six whole presets or nothing — there is no pylon
    // to hang a choice from.
    expect(armamentFor("ussr-pe-8")).toBeNull();
  });

  it("returns null for an aircraft with no matched unit at all", () => {
    expect(armamentFor("nonsense-id")).toBeNull();
  });

  it("decodes the mass limits by name, not by the order they were written in", () => {
    const armament = armamentFor("usa-f-82e")!;
    expect(armament).not.toBeNull();
    expect(armament.maxLoadKg).toBe(2726);
    expect(armament.perWingKg).toBe(1363);
    // Distinct from perWingKg on purpose — a decoder reading the wrong field
    // for either would still pass a test where the two happened to agree.
    expect(armament.disbalanceKg).toBe(950);
  });

  it("counts a rack's rounds and carries the choice's own icon, not its weapon's", () => {
    const armament = armamentFor("usa-f-82e")!;
    const slot = armament.hardpoints.find((h) => h.index === 1)!;
    const option = slot.options.find((o) => o.name === "hvar")!;

    expect(option.stores).toHaveLength(1);
    const { store, count } = option.stores[0];
    expect(count).toBe(1);
    expect(store.name).toBe("HVAR rockets");
    expect(store.short).toBe("HVAR");
    expect(store.kind).toBe("rocket");
    expect(store.bomb).toEqual({ id: "hvar", count: 5 });
    // Five HVARs per launcher, independent of what the chart's own bomb count says.
    expect(store.holds).toBe(5);
    // The preset states its own icon for a five-round rocket pod, which is
    // not the same key the lone rocket's own weapon file carries.
    expect(option.iconType).toBe("rockets_he_large_group_x5");
    expect(store.iconType).toBe("rockets_he_small");
  });

  it("defaults a store's holds to one when the compact data leaves it out", () => {
    const armament = armamentFor("usa-f-82e")!;
    const bareBomb = armament.hardpoints
      .flatMap((h) => h.options)
      .flatMap((o) => o.stores)
      .find((s) => s.store.bomb && s.store.bomb.count === 1);
    expect(bareBomb?.store.holds).toBe(1);
  });

  it("decodes exclusions and dependencies from their compact tuples", () => {
    const armament = armamentFor("usa-a-10c")!;
    expect(armament.exclusions).toContainEqual({
      slot: 6,
      option: "ptb_slot6",
      otherSlot: 5,
      otherOption: "2000lbs_slot5",
    });
    expect(armament.dependencies).toContainEqual({
      slot: 1,
      option: "gbu12_slot1",
      needsSlot: 10,
      needsOption: "sniper_pod",
    });
  });

  it("keeps every hardpoint's own sparse index, gaps and all", () => {
    const armament = armamentFor("usa-f-82e")!;
    expect(armament.hardpoints.map((h) => h.index)).toEqual([1, 2, 3, 4, 5]);
  });
});
