import { describe, expect, it } from "vitest";
import statsData from "../../data/armament-stats.json";
import { rewardDamageOf } from "../../domain/bomb-chart";
import { NATIONS } from "../../domain/constants";
import type { WeaponStats } from "../../domain/types";
import { bombsIn, buildFor, variantOf, violationsOf } from "../../domain/loadout";
import { aircraft, aircraftCarrying, armamentFor, bombsById } from "../dataset";

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

describe("aircraftCarrying", () => {
  it("joins the sheet's loadouts to the game's hardpoints, marking which is which", () => {
    const carriers = aircraftCarrying("mk-82");
    // The F-4J's own loadouts drop Mk 82s; the F-84F merely has pylons that can.
    expect(carriers.find((c) => c.plane.id === "usa-f-4j")?.inSheet).toBe(true);
    expect(carriers.find((c) => c.plane.id === "usa-f-84f")?.inSheet).toBe(false);
  });

  it("finds aircraft with fixed setups, through the sheet and through the game's own setups", () => {
    // The Pe-8 has no pylons in the game data (see armamentFor above).
    expect(aircraftCarrying("100sv").find((c) => c.plane.id === "ussr-pe-8")?.inSheet).toBe(true);
    // Its FAB-5000 is in one of its setups and in none of the sheet's loadouts.
    expect(aircraftCarrying("fab-5000").find((c) => c.plane.id === "ussr-pe-8")?.inSheet).toBe(false);
  });

  it("tells a bomb's variants apart rather than folding them into the plain one", () => {
    // The game's "Mk 82 Snakeye" and "Mk 82 AIR" once priced as the plain Mk 82.
    expect(aircraftCarrying("500-lb-mk-82-snake-eye").length).toBeGreaterThan(0);
    expect(aircraftCarrying("500-lb-ldgp-mk-82-air").length).toBeGreaterThan(0);
    // "KAB-500L guided" run together starts with "KAB-500LG".
    expect(aircraftCarrying("500-kg-kab-500l").length).toBeGreaterThan(0);
  });

  it("lists nation by nation, in the chips' order, and by BR within one", () => {
    const carriers = aircraftCarrying("mk-82");
    const nations = carriers.map((c) => NATIONS.indexOf(c.plane.nation));
    expect(nations).toEqual([...nations].sort((a, b) => a - b));
    const usa = carriers.filter((c) => c.plane.nation === "usa").map((c) => c.plane.br);
    expect(usa).toEqual([...usa].sort((a, b) => a - b));
  });

  it("returns nothing for an unknown bomb", () => {
    expect(aircraftCarrying("nonsense-id")).toEqual([]);
  });
});

describe("the armament table, the game's files over the sheet", () => {
  const stats = statsData as unknown as Record<string, WeaponStats>;

  it("takes the game's price where the sheet's is out of date, keeping the sheet's beside it", () => {
    // The Navy's GBU-38(V): the game prices it at 2072, the sheet at 2372.
    expect(bombsById.get("gbu-38-v")).toMatchObject({ damageValue: 2072, damageSource: "game" });
    expect(bombsById.get("gbu-38-v")!.sheet?.damageValue).toBe(2372);
    // The BRAB-500 (1938): 162 kg of TNT, which the game prices at 3047.
    expect(bombsById.get("brab-500-l")).toMatchObject({ damageValue: 3047, damageSource: "game" });
  });

  it("keeps the sheet's price where the game gives none of its own", () => {
    // The Pe-8's FAB-5000 is priced only inside a fixed setup, which the sheet copied.
    expect(bombsById.get("fab-5000")).toMatchObject({ damageValue: 30521, damageSource: "sheet" });
  });

  it("lists what the sheet never had, from the game alone", () => {
    expect(bombsById.get("kd-88")).toMatchObject({
      kind: "AGM",
      guidance: "tv+IOG+GNSS",
      source: "game",
      damageValue: 2064,
      damageSource: "estimate",
    });
    expect(bombsById.get("gbu-62-jdam-er")).toMatchObject({ kind: "GNSS", damageValue: 2464, damageSource: "game" });
    expect(bombsById.get("b61")).toMatchObject({ damageValue: 1200000, source: "game" });
    expect(bombsById.get("aim-120c-5")).toMatchObject({ kind: "AAM", damageValue: null });
  });

  it("splits off what the sheet folded into one row though the game prices it apart", () => {
    // Eight American HVAR files at 380, one British at 359.
    expect(bombsById.get("hvar")).toMatchObject({ damageValue: 380 });
    expect(bombsById.get("hvar-uk-hvar")).toMatchObject({ damageValue: 359, source: "game" });
  });

  it("gives every figure a source, and an estimate nothing towards the reward", () => {
    for (const bomb of bombsById.values()) {
      if (bomb.damageValue !== null) expect(bomb.damageSource, bomb.id).toBeDefined();
    }
    expect(rewardDamageOf(bombsById.get("kd-88")!)).toBe(0);
    expect(rewardDamageOf(bombsById.get("mk-82")!)).toBe(2464);
  });

  it("reads each weapon's figures as the game's tooltip shows them", () => {
    // Against the in-game tooltip: 710 kg, TV+IOG+GNSS, 230 km, 0.9 M, 825 s,
    // PBXN-3, 70.5 kg, 90.95 kg TNT, SAP-HE.
    expect(stats["kd-88"]).toMatchObject({
      massKg: 710,
      guidance: "tv+IOG+GNSS",
      launchRangeM: 230000,
      machMax: 0.85,
      timeLifeS: 825,
      explosiveType: "pbxn_3",
      explosiveMassKg: 70.5,
      warhead: "aphe",
    });
    expect(stats["kd-88"].tntKg).toBeCloseTo(90.95, 2);
    // The KD-88A's IR seeker: 20 km lock range.
    expect(stats["kd-88a"]).toMatchObject({ guidance: "ir+IOG+GNSS", seekerRangeM: 20000 });
  });
});

describe("guided bombs' seekers, as the game labels them", () => {
  const guidance = (id: string) => {
    const { kind, guidance } = bombsById.get(id)!;
    return { kind, guidance };
  };

  it("tells the AASM's three versions apart, as the game's files do", () => {
    // The sheet files all three under GNSS. The game names its laser version
    // SBU 54 and its infrared one SBU 64.
    expect(guidance("aasm-250")).toEqual({ kind: "GNSS", guidance: "sns" });
    expect(guidance("aasm-250-hammer-sbu-54")).toEqual({ kind: "LAS", guidance: "laser+IOG+GNSS" });
    expect(guidance("aasm-250-hammer-sbu-64")).toEqual({ kind: "IR", guidance: "ir+IOG+GNSS" });
  });

  it("marks satellite-aided INS apart from INS alone", () => {
    expect(guidance("paveway-iv")).toEqual({ kind: "LAS", guidance: "laser+IOG+GNSS" });
    expect(guidance("gbu-50")).toEqual({ kind: "LAS", guidance: "laser+IOG+GNSS" });
    expect(guidance("pgm-2000-3")).toEqual({ kind: "IR", guidance: "ir+IOG" });
    expect(guidance("gbu-12")).toEqual({ kind: "LAS", guidance: "laser" });
  });

  it("keeps the sheet's kind where the game's files disagree", () => {
    // Also the game's UMPK glide kit, but a plain bomb in its own file.
    expect(guidance("500m-62")).toEqual({ kind: "GP", guidance: undefined });
    // Comes TV- and laser-guided.
    expect(guidance("pgm-2000")).toEqual({ kind: "TV", guidance: undefined });
  });

  it("no longer lets the laser AASM stand in for the GPS one", () => {
    expect(variantOf(bombsById.get("aasm-250-hammer-sbu-54")!, bombsById.get("aasm-250")!)).toBe(false);
  });
});

/**
 * The sheet's loadouts hung on the game's pylons, as the planner's "open in the
 * creator" does it — a variant standing in only where the pylons lack the bomb.
 */
describe("buildFor against the sheet", () => {
  const standsIn = (id: string, of: string) => variantOf(bombsById.get(id)!, bombsById.get(of)!);
  const wantedOf = (planeId: string, option: number) =>
    aircraft
      .find((p) => p.id === planeId)!
      .options[option].schedules[0].bases.flatMap((base) => base.items);

  it("hangs the F-4J's twelve Mk 82s and six M117s exactly, within the rules", () => {
    const armament = armamentFor("usa-f-4j")!;
    const build = buildFor(armament, wantedOf("usa-f-4j", 2), standsIn)!;
    expect(bombsIn(build, armament).sort((a, b) => a.bombId.localeCompare(b.bombId))).toEqual([
      { bombId: "m117", count: 6 },
      { bombId: "mk-82", count: 12 },
    ]);
    expect(violationsOf(build, armament)).toEqual([]);
  });

  it("takes the mod of Mk 77 the pylons carry for the one the sheet names", () => {
    // The sheet's "Mk 77" is the mod 2; the A-4B's racks hang the mod 4.
    const armament = armamentFor("usa-a-4b")!;
    const build = buildFor(armament, wantedOf("usa-a-4b", 0), standsIn)!;
    expect(bombsIn(build, armament)).toEqual([{ bombId: "mk-77-mod-4", count: 7 }]);
  });

  it("hangs the F-15E's GBU-64s as GBU-64s, not the GBU-31s that price the same", () => {
    const armament = armamentFor("usa-f-15e")!;
    const build = buildFor(armament, wantedOf("usa-f-15e", 0), standsIn)!;
    expect(bombsIn(build, armament).sort((a, b) => a.bombId.localeCompare(b.bombId))).toEqual([
      { bombId: "agm-130", count: 2 },
      { bombId: "gbu-64", count: 4 },
    ]);
  });

  it("offers nothing rather than another bomb where the pylons lack the one named", () => {
    // The Gripen hangs the GBU-62 JDAM-ER, which the chart does not price;
    // the GBU-38 prices the same and is still not it.
    expect(buildFor(armamentFor("sweden-jas39c")!, wantedOf("sweden-jas39c", 0), standsIn)).toBeNull();
  });

  it("carries the one spare round the Halifax's bomb bay forces", () => {
    const armament = armamentFor("britain-halifax-b-iiia")!;
    const build = buildFor(armament, wantedOf("britain-halifax-b-iiia", 0), standsIn)!;
    const carried = bombsIn(build, armament).reduce((n, b) => n + b.count, 0);
    expect(carried).toBe(15);
  });

  it("hangs nine in ten of the sheet's loadouts on aircraft with pylons", () => {
    let tried = 0;
    let hung = 0;
    for (const plane of aircraft) {
      const armament = armamentFor(plane.id);
      if (!armament) continue;
      for (const option of plane.options) {
        const schedule = option.schedules[0];
        if (!schedule || (schedule.basesDestroyed ?? 0) > schedule.bases.length) continue;
        const wanted = schedule.bases.flatMap((base) => base.items);
        if (wanted.length === 0) continue;
        tried++;
        if (buildFor(armament, wanted, standsIn)) hung++;
      }
    }
    expect(hung / tried).toBeGreaterThan(0.9);
  });
});
