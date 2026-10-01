import { describe, expect, it } from "vitest";
import statsData from "../../data/armament-stats.json";
import { inTab, rewardDamageOf, TABS } from "../../domain/bomb-chart";
import { NATIONS } from "../../domain/constants";
import type { BaseLoadout, WeaponStats } from "../../domain/types";
import { bombsIn, buildFor, carriedWithin, variantOf, violationsOf } from "../../domain/loadout";
import { splitIntoBases } from "../../domain/fit";
import { WEAPON_CATEGORIES, WEAPON_TAGS } from "../../domain/weapon-tags";
import { buildPlan } from "../../domain/schedule";
import {
  aircraft,
  aircraftCarrying,
  aircraftIndex,
  armamentFor,
  bombs,
  bombsById,
  chartRowsFor,
  compareData,
  gameLabel,
  otherCarriersOf,
  pagedBombs,
} from "../dataset";

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

describe("aircraftIndex", () => {
  const summary = (id: string) => aircraftIndex.find((plane) => plane.id === id)!;

  it("marks a gold tile as the game does, where the sheet files it as researched", () => {
    expect(summary("usa-av-8b-na").premium).toBe(true);
    expect(summary("china-a-5c").premium).toBe(true);
    expect(summary("usa-av-8b-plus").premium).toBe(false);
  });
});

describe("release limits", () => {
  it("reads each preset's own, as the game's tooltip shows them", () => {
    const options = new Map(
      armamentFor("usa-a-10c")!.hardpoints.flatMap((h) => h.options.map((o) => [o.name, o.machLimit] as const)),
    );
    expect(options.get("gbu12_slot3")).toBe(1.01);
    expect(options.get("agm_65d_x3_slot3")).toBe(1.4);
    // The A-10C's rocket pods state none.
    expect(options.get("hydra_70_x1_slot3")).toBeNull();
  });
});

describe("the armament chart's rows", () => {
  it("page every weapon the game catalogues, and no sheet placeholder", () => {
    expect(pagedBombs.some((bomb) => bomb.kind === "AAM")).toBe(true);
    expect(pagedBombs.some((bomb) => bomb.kind === "TORPEDO")).toBe(true);
    expect(pagedBombs.find((bomb) => bomb.id === "130-2")).toBeUndefined();
  });

  it("leave /armament/compare/ to the comparison", () => {
    expect(pagedBombs.some((bomb) => bomb.id === "compare")).toBe(false);
  });

  it("hand the browser the chart's figures only, the game's labels in the page's language", () => {
    const rows = chartRowsFor("pl");
    const kd88 = rows.find((row) => row.id === "kd-88")!;
    expect(kd88).toMatchObject({ damageSource: "estimate", launchRangeM: 230000, machMax: 0.85, guidanceTimeS: 825 });
    expect(kd88.warhead).toBe(gameLabel("pl", "rocket/warhead/aphe"));
    expect(kd88.explosive).toBe(gameLabel("pl", "explosiveType/pbxn_3"));
    expect(rows.every((row) => !("sheetCounts" in row) && !("sheet" in row))).toBe(true);
    expect(rows.every((row) => Object.values(row).every((value) => value !== undefined))).toBe(true);
  });

  it("give an unguided rocket no guidance time: its timer is the self-destruct's", () => {
    expect(chartRowsFor("en").find((row) => row.id === "rz-65")?.guidanceTimeS).toBeUndefined();
  });

  it("carry each weapon's category and tags, and sit on exactly one category's tab", () => {
    const rows = chartRowsFor("en");
    expect(rows.find((row) => row.id === "kd-88")).toMatchObject({ category: "agm", tags: ["tv", "iog", "gnssAid", "aphe"] });
    for (const row of rows) {
      const tabs = TABS.filter((tab) => tab !== "bases" && tab !== "all" && inTab(row, tab));
      expect(tabs, row.id).toHaveLength(1);
    }
  });

  it("hand the comparison each weapon's category and tags too", () => {
    const { rows } = compareData();
    expect(rows.find((row) => row.id === "kd-88")).toMatchObject({ category: "agm", tags: ["tv", "iog", "gnssAid", "aphe"] });
    expect(rows.every((row) => row.category && row.tags)).toBe(true);
  });
});

describe("otherCarriersOf", () => {
  const id = "1000-lb-an-m65a1-fin-m129";

  it("names the aircraft outside the site as the game's tech tree does, in the page's language", () => {
    expect(otherCarriersOf("en", id)).toContain("F-86A-5");
    expect(otherCarriersOf("pl", id)).toContain("F-86A-5 Sabre");
  });

  it("names each once", () => {
    const names = otherCarriersOf("en", id);
    expect(new Set(names).size).toBe(names.length);
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
    expect(aircraftCarrying("100-kg-fab-100sv-forged").find((c) => c.plane.id === "ussr-pe-8")?.inSheet).toBe(true);
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

  it("prices a bomb only a fixed setup hangs by that setup's price", () => {
    // The Pe-8's FAB-5000 is priced only as the setup `pe-8_fab5000`: 30 521 for its one bomb.
    expect(bombsById.get("fab-5000")).toMatchObject({ damageValue: 30521, damageSource: "game" });
  });

  it("never takes a damage figure from the sheet", () => {
    expect(pagedBombs.filter((bomb) => bomb.damageValue !== null && !bomb.damageSource).map((bomb) => bomb.id)).toEqual([]);
    // The AGM-123 the game prices nowhere: its explosion model's estimate, which is the sheet's figure too.
    expect(bombsById.get("agm-123")).toMatchObject({ damageValue: 4720, damageSource: "estimate" });
  });

  it("reads a sheet row the game has under another name as that weapon, without a page of its own", () => {
    // The Hampden's 1000-pounder: the one 1000 lb G.P. Mk.I the game has, not the sheet's 5279.
    expect(bombsById.get("g-p-1000-l")).toMatchObject({ damageValue: 2906, damageSource: "game", aliasOf: "g-p-1000-e" });
    expect(pagedBombs.some((bomb) => bomb.id === "g-p-1000-l")).toBe(false);
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

  it("gives a loadout of estimates alone no reward multiplier, not the sheet's", () => {
    // The Tornado GR.4's three PGM 2000s: an estimate each, the sheet's 6.9 counts them.
    const tornado = aircraft.find((plane) => plane.id === "britain-tornado-gr-4")!;
    expect(tornado.options[1].schedules[0].rewardMultiplier).toBeNull();
    expect(tornado.options[0].schedules[0].rewardMultiplier).not.toBeNull();
  });

  it("prices each schedule's own load, where the sheet gives a loadout one figure", () => {
    // The Il-4 takes eight FAB-100s and three FAB-500s a bracket down, ten and three up.
    const il4 = aircraft.find((plane) => plane.id === "ussr-il-4")!.options[0];
    expect(il4.schedules.map((schedule) => schedule.rewardMultiplier)).toEqual([7.1, 6.6]);
    // The Mirage 5F's the sheet leaves without one.
    const mirage = aircraft.find((plane) => plane.id === "france-mirage-5f")!.options[0];
    expect(mirage.rewardMultiplier).toBeNull();
    expect(mirage.schedules[0].rewardMultiplier).not.toBeNull();
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

describe("categories and tags, off the game's files", () => {
  const tagsOf = (id: string) => bombsById.get(id)!.tags;
  const BOMB_TYPES = ["gp", "ap", "sap", "drag", "incendiary", "nuclear"];
  const SEEKERS = ["laser", "tv", "ir", "gnss", "sarh", "arh", "antiRadiation", "saclos", "beamRiding", "mclos"];

  it("files every row under a category, with only tags the pages know", () => {
    for (const bomb of bombs) {
      expect(WEAPON_CATEGORIES, bomb.id).toContain(bomb.category);
      for (const tag of bomb.tags!) expect(WEAPON_TAGS, bomb.id).toContain(tag);
    }
  });

  it("gives every bomb the pages show one type, and everything but a torpedo, mine or gun pod something to steer it or not", () => {
    // A sheet row the game has no file for shows nowhere, and its kind alone names no type.
    for (const bomb of pagedBombs) {
      const tags = bomb.tags!;
      if (bomb.category === "bomb") expect(tags.filter((t) => BOMB_TYPES.includes(t)), bomb.id).toHaveLength(1);
      if (["bomb", "rocket", "agm", "aam"].includes(bomb.category!)) {
        const steering = tags.filter((t) => t === "unguided" || SEEKERS.includes(t));
        expect(steering, bomb.id).toHaveLength(1);
      } else {
        expect(tags, bomb.id).toEqual([]);
      }
    }
  });

  it("files a missile as the game's tooltip does, by the trigger an aircraft fires it with", () => {
    // SACLOS, anti-ship and the Orion's beam-riding Kornets: none of them air-to-air.
    for (const id of ["e-24-a1", "grom", "am39", "as-34", "as-34-ii", "9m133m-2", "9m133fm3"]) {
      expect(bombsById.get(id)!.category, id).toBe("agm");
    }
    const steering = new Set(bombs.filter((b) => b.category === "aam").flatMap((b) => b.tags!.filter((t) => SEEKERS.includes(t))));
    // Radar, IR, and the X-4 and AA-20 flown down a wire.
    expect([...steering].sort()).toEqual(["arh", "ir", "mclos", "sarh"]);
  });

  it("calls no guided bomb high-drag: its own drag is not a chute", () => {
    const guidedDrag = bombs.filter((b) => b.tags!.includes("drag") && !b.tags!.includes("unguided"));
    expect(guidedDrag.map((b) => b.id)).toEqual([]);
    expect(tagsOf("ls-6-ir-500")).not.toContain("drag");
    expect(tagsOf("spice-1k")).not.toContain("drag");
    expect(tagsOf("rds-37")).toEqual(["nuclear", "unguided"]);
    expect(tagsOf("500-lb-mk-82-snake-eye")).toEqual(["drag", "unguided"]);
  });

  it("splits air-to-air missiles the way the game's tooltip does", () => {
    expect(tagsOf("aim-9b")).toEqual(["ir", "rearAspect"]);
    // IRCCM: a rejected flare band (AIM-9M) or a gate narrower than the view (R-73, R-27ET); the AIM-9L has neither.
    expect(tagsOf("aim-9l")).toEqual(["ir", "allAspect"]);
    expect(tagsOf("aim-9m")).toEqual(["ir", "allAspect", "irccm"]);
    expect(tagsOf("r-73")).toEqual(["ir", "allAspect", "irccm"]);
    expect(tagsOf("r-27et")).toEqual(["ir", "allAspect", "irccm"]);
    expect(tagsOf("aim-7m")).toEqual(["sarh"]);
    expect(tagsOf("r-27er")).toEqual(["sarh", "iog", "datalink"]);
    expect(tagsOf("aim-120a")).toEqual(["arh", "iog", "datalink"]);
    expect(tagsOf("aim-120d")).toEqual(["arh", "iog", "gnssAid", "datalink"]);
  });

  it("tags air-to-ground weapons, bombs and rockets by their files", () => {
    expect(tagsOf("agm-88c")).toEqual(["antiRadiation", "iog", "he"]);
    expect(tagsOf("kd-88")).toEqual(["tv", "iog", "gnssAid", "aphe"]);
    expect(tagsOf("gbu-54")).toEqual(["gp", "laser", "iog", "gnssAid"]);
    expect(tagsOf("gbu-38")).toEqual(["gp", "gnss"]);
    expect(tagsOf("brab-500-e")).toEqual(["ap", "unguided"]);
    // SD 50: a blast bomb that also pierces — the sheet calls it GP.
    expect(tagsOf("sd50")).toEqual(["sap", "unguided"]);
    // ZAB: "sks" names no fire, but it burns.
    expect(tagsOf("zb-500")).toEqual(["incendiary", "unguided"]);
    expect(tagsOf("sneb-type-23")).toEqual(["unguided", "heat"]);
    // O-100: two plain OFAB-100s outvote the Czech high-drag one.
    expect(tagsOf("o-100")).toEqual(["gp", "unguided"]);
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

  it("hangs the Gripen's GBU-62 JDAM-ER, the bomb its plan names now the game decides it", () => {
    // The sheet named a laser GBU-62 the Gripen cannot hang; the import puts
    // the JDAM-ER its pylons do carry in its place, not the GBU-38 that prices the same.
    const armament = armamentFor("sweden-jas39c")!;
    const build = buildFor(armament, wantedOf("sweden-jas39c", 0), standsIn)!;
    expect(bombsIn(build, armament).map((b) => b.bombId)).toContain("gbu-62-jdam-er");
  });

  it("carries the one spare round the Halifax's bomb bay forces", () => {
    const armament = armamentFor("britain-halifax-b-iiia")!;
    const build = buildFor(armament, wantedOf("britain-halifax-b-iiia", 0), standsIn)!;
    const carried = bombsIn(build, armament).reduce((n, b) => n + b.count, 0);
    expect(carried).toBe(15);
  });

  it("makes up a bomb the pylons hang with its variant where they hang too few", () => {
    // The Pe-2's ten FAB-100sv: two stations hang the plain one, eight the forged.
    const armament = armamentFor("ussr-pe-2-1")!;
    const build = buildFor(armament, wantedOf("ussr-pe-2-1", 0), standsIn)!;
    expect(bombsIn(build, armament).sort((a, b) => a.bombId.localeCompare(b.bombId))).toEqual([
      { bombId: "100-kg-fab-100sv-forged", count: 8 },
      { bombId: "100sv", count: 2 },
    ]);
    // The B-52H's bay racks hang the M117 cone 90, its wing beams the cone 45.
    const b52 = armamentFor("usa-b-52h")!;
    const bombs = bombsIn(buildFor(b52, wantedOf("usa-b-52h", 0), standsIn)!, b52);
    expect(bombs.find((b) => b.bombId === "750-lb-m117-cone-90")?.count).toBe(27);
  });

  it("hangs every schedule the sheet writes for an aircraft with pylons, but those the game rules out", () => {
    const cannot: string[] = [];
    for (const plane of aircraft) {
      const armament = armamentFor(plane.id);
      if (!armament) continue;
      plane.options.forEach((option, index) => {
        for (const schedule of option.schedules) {
          // Bases the sheet counts without writing their bombs leave nothing to hang.
          if ((schedule.basesDestroyed ?? 0) > schedule.bases.length) continue;
          const build = buildFor(armament, schedule.bases.flatMap((base) => base.items), standsIn);
          const over = build !== null && violationsOf(build, armament).some((v) => v.kind === "overweight");
          if (!build || over) cannot.push(`${plane.id} ${index + 1}@${schedule.baseHp}${build ? " over the limit" : ""}`);
        }
      });
    }
    // The sheet's own mistakes against the game's files — eight HVARs beside two
    // 1000-pounders where the P-51D's shared stations leave room for six, five
    // Flam C 250s on the Ju 88 A-4's four stations, loads past what the
    // airframe lifts — are put right by the import: see the plans below.
    expect(cannot).toEqual([]);
  });

  it("leaves no plan a fixed-setup aircraft cannot carry", () => {
    const marked = aircraft.flatMap((plane) =>
      plane.options.flatMap((option, index) =>
        option.schedules.flatMap((schedule) => (schedule.noSetup ? [`${plane.id} ${index + 1}@${schedule.baseHp}`] : [])),
      ),
    );
    expect(marked).toEqual([]);
  });
});

/**
 * The sheet's plans an aircraft cannot carry as written, and what the import
 * put in their place (scripts/armament, src/domain/fit.ts). Nothing here may
 * be too big — more than the aircraft carries, or than the sheet names — nor
 * too small, giving up a round that could have stayed.
 */
describe("plans put right to what the aircraft carries", () => {
  const standsIn = (id: string, of: string) => variantOf(bombsById.get(id)!, bombsById.get(of)!);
  const damageOf = (bombId: string) => bombsById.get(bombId)?.damageValue ?? 0;
  const loadOf = (bases: BaseLoadout[]) => {
    const totals = new Map<string, number>();
    for (const item of bases.flatMap((base) => base.items)) {
      totals.set(item.bombId, (totals.get(item.bombId) ?? 0) + item.count);
    }
    return totals;
  };
  const fitted = aircraft.flatMap((plane) =>
    plane.options.flatMap((option, index) =>
      option.schedules.flatMap((schedule) => (schedule.sheetPlan ? [{ plane, index, schedule }] : [])),
    ),
  );

  it("are these, each as the import put it right", () => {
    const lines = fitted.map(
      ({ plane, index, schedule }) =>
        `${plane.id} ${index + 1}@${schedule.baseHp}: ` +
        [...loadOf(schedule.bases)].map(([bombId, count]) => `${count} ${bombId}`).join(" + ") +
        ` → ${schedule.basesDestroyed}`,
    );
    // Some bring down as many bases as the sheet's plan; the rest lose one, or
    // the only one, by the game's figures. The fixed setups are the game's own
    // (Me 410 A-1: 8 × SC50; B-17E: "16x500lbs", which hangs twelve at
    // 36 720 = 12 × 3060).
    expect(lines).toEqual([
      "usa-p-47n-15 1@10000: 3 an-m65a1 + 7 hvar-uk-hvar → 1",
      "usa-p-47n-15 1@16000: 3 an-m65a1 + 7 hvar-uk-hvar → 1",
      "usa-p-51d-20-na 1@10000: 2 an-m65a1 + 6 hvar-uk-hvar → 1",
      "usa-p-51d-20-na 1@16000: 2 an-m65a1 + 6 hvar-uk-hvar → 0",
      "usa-a-1h 1@16000: 2 blu-1 + 3 mk-81 + 6 mk-82 + 8 mk-77 → 7",
      "usa-a-1h 3@16000: 4 an-m64a1 + 6 mk-82 + 3 mk-81 + 2 blu-1 + 4 mk-77 → 6",
      "usa-a-1h 3@22000: 4 an-m64a1 + 6 mk-82 + 3 mk-81 + 2 blu-1 + 4 mk-77 → 4",
      "germany-me-210a-1 1@10000: 9 sc50 → 1",
      "germany-ju-88-a-4 1@10000: 4 fc250 + 28 sc50 → 7",
      "germany-me-410-a-1 1@6000: 8 sc50 → 1",
      "germany-me-410-a-1 1@10000: 8 sc50 → 0",
      "germany-ju-188-a-2 2@16000: 1 fc500 + 1 sc250 + 10 sc50 + 1 sc1800 → 2",
      "ussr-su-6 1@10000: 2 50sv + 16 ao-25 → 0",
      "britain-wirraway 1@4000: 2 g-p-500 + 1 g-p-250 → 1",
      "britain-wirraway 1@6000: 2 g-p-500 + 1 g-p-250 → 0",
      "japan-me-210-v22 1@10000: 9 sc50 → 1",
      "japan-b-17e 1@16000: 12 an-m64a1 → 2",
      "china-p-51k 1@16000: 2 an-m65a1 + 6 hvar-uk-hvar → 0",
      "china-f-47n-25-re 1@10000: 3 an-m65a1 + 7 hvar → 1",
      "china-f-47n-25-re 1@16000: 3 an-m65a1 + 7 hvar → 1",
      "china-f-100f 1@25900: 5 blu-27 → 2",
      "china-f-100f 2@25900: 5 blu-27 → 2",
      "china-a-5c 2@25900: 1 500-4 + 4 m117 → 0",
      "italy-me-210-ca-1 1@10000: 9 sc50 → 1",
      "israel-kfir-c-2 1@25900: 6 mk-83 + 5 mk-82 → 1",
    ]);
  });

  it("hang exactly what they list on pylons, and never more of a bomb than the sheet names", () => {
    for (const { plane, index, schedule } of fitted) {
      const armament = armamentFor(plane.id);
      if (!armament) continue;
      const where = `${plane.id} ${index + 1}@${schedule.baseHp}`;
      const load = [...loadOf(schedule.bases)].map(([bombId, count]) => ({ bombId, count }));
      const sheet = loadOf(schedule.sheetPlan!.bases);
      for (const { bombId, count } of load) expect(count, where).toBeLessThanOrEqual(sheet.get(bombId) ?? 0);
      const build = carriedWithin(armament, load, standsIn, true);
      expect(build, where).not.toBeNull();
      expect(violationsOf(build!, armament), where).toEqual([]);
    }
  });

  it("give up nothing that could have stayed: one more round of the sheet's would not hang", () => {
    for (const { plane, index, schedule } of fitted) {
      const armament = armamentFor(plane.id);
      if (!armament) continue;
      const kept = loadOf(schedule.bases);
      for (const [bombId, planned] of loadOf(schedule.sheetPlan!.bases)) {
        if ((kept.get(bombId) ?? 0) >= planned) continue;
        const more = new Map(kept).set(bombId, (kept.get(bombId) ?? 0) + 1);
        const load = [...more].map(([id, count]) => ({ bombId: id, count }));
        expect(carriedWithin(armament, load, standsIn, true), `${plane.id} ${index + 1}@${schedule.baseHp} + 1 ${bombId}`).toBeNull();
      }
    }
  });

  it("offer beside a setup put in a plan's place the game's others that do as well", () => {
    const added = aircraft.flatMap((plane) =>
      plane.options.flatMap((option, index) =>
        option.gameSetup
          ? option.schedules.map((schedule) => {
              const plan = buildPlan(schedule, bombsById, { baseHp: schedule.baseHp, mode: "rb", baseCount: 4 });
              // Every base it counts comes down by the game's figures.
              expect(plan.basesDestroyed).toBe(schedule.basesDestroyed);
              const load = [...loadOf(schedule.bases)].map(([bombId, count]) => `${count} ${bombId}`).join(" + ");
              return `${plane.id} ${index + 1}@${schedule.baseHp}: ${load} → ${schedule.basesDestroyed}`;
            })
          : [],
      ),
    );
    // Its six 1000-pounders bring down the two bases the twelve 500-pounders do at 16 000 HP.
    expect(added).toEqual(["japan-b-17e 2@10000: 6 an-m65a1 → 3", "japan-b-17e 2@16000: 6 an-m65a1 → 2"]);
  });

  it("count the bases their load brings down, as many as it can, never more than the sheet", () => {
    for (const { plane, index, schedule } of fitted) {
      const where = `${plane.id} ${index + 1}@${schedule.baseHp}`;
      const plan = buildPlan(schedule, bombsById, { baseHp: schedule.baseHp, mode: "rb", baseCount: 4 });
      // Every base it counts comes down by the game's figures.
      expect(plan.basesDestroyed, where).toBe(schedule.basesDestroyed);
      const cap = schedule.sheetPlan!.basesDestroyed ?? Infinity;
      expect(schedule.basesDestroyed!, where).toBeLessThanOrEqual(cap);
      const load = [...loadOf(schedule.bases)].map(([bombId, count]) => ({ bombId, count }));
      expect(splitIntoBases(load, damageOf, plan.threshold, cap).bases.length, where).toBe(schedule.basesDestroyed);
    }
  });
});
