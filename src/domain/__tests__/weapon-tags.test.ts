import { describe, expect, it } from "vitest";
import { categoryOfKind, tagsOf, tagsOfKind, type RoundFacts } from "../weapon-tags";

const round = (over: Partial<RoundFacts>): RoundFacts => ({
  category: "bomb",
  stats: {},
  incendiary: false,
  drag: false,
  armourPiercing: null,
  ...over,
});

describe("tagsOf", () => {
  it("gives a plain bomb its type and no guidance", () => {
    expect(tagsOf(round({}))).toEqual(["gp", "unguided"]);
    expect(tagsOf(round({ armourPiercing: "ap" }))).toEqual(["ap", "unguided"]);
    expect(tagsOf(round({ armourPiercing: "sap" }))).toEqual(["sap", "unguided"]);
    expect(tagsOf(round({ drag: true }))).toEqual(["drag", "unguided"]);
    expect(tagsOf(round({ incendiary: true }))).toEqual(["incendiary", "unguided"]);
    // The RDS-37: its yield is what it is.
    expect(tagsOf(round({ stats: { nuclearYieldKt: 1600 } }))).toEqual(["nuclear", "unguided"]);
  });

  it("gives a guided bomb its seeker and what helps it, beside its type", () => {
    // GBU-54: laser, with satellite-aided inertial navigation.
    expect(tagsOf(round({ category: "guidedBomb", stats: { guidance: "laser+IOG+GNSS" } }))).toEqual([
      "gp",
      "laser",
      "iog",
      "gnssAid",
    ]);
    // GBU-39: satellite guidance alone, and it pierces.
    expect(tagsOf(round({ category: "guidedBomb", armourPiercing: "sap", stats: { guidance: "sns" } }))).toEqual([
      "sap",
      "gnss",
    ]);
    // Fritz X: flown by hand.
    expect(tagsOf(round({ category: "guidedBomb", armourPiercing: "ap", stats: { aiming: "manual" } }))).toEqual([
      "ap",
      "mclos",
    ]);
  });

  it("splits air-to-air missiles by seeker, aspect, counter-countermeasures and what guides them on the way", () => {
    const aam = (stats: RoundFacts["stats"]) => tagsOf(round({ category: "aam", stats }));
    expect(aam({ guidance: "ir", allAspect: false })).toEqual(["ir", "rearAspect"]);
    expect(aam({ guidance: "ir", allAspect: true })).toEqual(["ir", "allAspect"]);
    expect(aam({ guidance: "ir", allAspect: true, irccm: true })).toEqual(["ir", "allAspect", "irccm"]);
    expect(aam({ guidance: "SARH" })).toEqual(["sarh"]);
    expect(aam({ guidance: "SARH+IOG+DL" })).toEqual(["sarh", "iog", "datalink"]);
    expect(aam({ guidance: "ARH+IOG+GNSS+DL" })).toEqual(["arh", "iog", "gnssAid", "datalink"]);
    expect(aam({ guidance: "beamRiding" })).toEqual(["beamRiding"]);
    expect(aam({ guidance: "saclos" })).toEqual(["saclos"]);
  });

  it("gives an air-to-ground missile its seeker and its warhead", () => {
    const agm = (stats: RoundFacts["stats"]) => tagsOf(round({ category: "agm", stats }));
    expect(agm({ guidance: "PRH", warhead: "he" })).toEqual(["antiRadiation", "he"]);
    expect(agm({ guidance: "tv+IOG+GNSS", warhead: "aphe" })).toEqual(["tv", "iog", "gnssAid", "aphe"]);
    expect(agm({ aiming: "semiautomatic", warhead: "tandem" })).toEqual(["saclos", "tandem"]);
    expect(agm({ aiming: "beamRiding", warhead: "heat" })).toEqual(["beamRiding", "heat"]);
  });

  it("gives a rocket its warhead, and guidance only where it has one", () => {
    expect(tagsOf(round({ category: "rocket", stats: { warhead: "heat" } }))).toEqual(["unguided", "heat"]);
    expect(tagsOf(round({ category: "rocket", stats: { guidance: "laser", warhead: "he" } }))).toEqual(["laser", "he"]);
  });

  it("tags no torpedo, mine or gun pod", () => {
    for (const category of ["torpedo", "mine", "gun"] as const) expect(tagsOf(round({ category }))).toEqual([]);
  });

  it("leaves a seeker the game has no word for untagged rather than guessing", () => {
    expect(tagsOf(round({ category: "agm", stats: { guidance: "optical" } }))).toEqual([]);
  });
});

describe("a sheet row no game file ties to", () => {
  it("takes its category and tags from the sheet's kind", () => {
    expect(categoryOfKind("GP")).toBe("bomb");
    expect(categoryOfKind("LAS")).toBe("bomb");
    expect(categoryOfKind("ROCKET")).toBe("rocket");
    expect(categoryOfKind("TORPEDO")).toBe("torpedo");
    expect(tagsOfKind("DRAG")).toEqual(["drag", "unguided"]);
    expect(tagsOfKind("LAS")).toEqual(["laser"]);
    expect(tagsOfKind("RC")).toEqual(["mclos"]);
    expect(tagsOfKind("ROCKET")).toEqual(["unguided"]);
    expect(tagsOfKind("AAM")).toEqual([]);
  });
});
