import { describe, expect, it } from "vitest";
import { facetState, matchesFacet, nextFacet } from "../facet";

const set = (...values: string[]) => new Set(values);

describe("matchesFacet", () => {
  it("lets everything through while nothing is ticked or crossed out", () => {
    expect(matchesFacet(["ROCKET"], set(), set())).toBe(true);
    expect(matchesFacet([], set(), set())).toBe(true);
  });

  it("keeps a row with any ticked value, and only those", () => {
    expect(matchesFacet(["GP"], set("GP", "AP"), set())).toBe(true);
    expect(matchesFacet(["ROCKET"], set("GP", "AP"), set())).toBe(false);
    // An aircraft with no type is not one of the ticked types.
    expect(matchesFacet([], set("GP"), set())).toBe(false);
  });

  it("drops a row with any crossed-out value, and keeps the rest", () => {
    expect(matchesFacet(["ROCKET"], set(), set("ROCKET"))).toBe(false);
    expect(matchesFacet(["GP"], set(), set("ROCKET"))).toBe(true);
    expect(matchesFacet([], set(), set("premium", "squadron"))).toBe(true);
    expect(matchesFacet(["premium"], set(), set("premium", "squadron"))).toBe(false);
  });

  it("drops a row a crossed-out value is on, even where a ticked one is too", () => {
    // A Paveway IV is laser-guided and a GNSS bomb both.
    expect(matchesFacet(["LAS", "GNSS"], set("LAS"), set("GNSS"))).toBe(false);
    expect(matchesFacet(["LAS"], set("LAS"), set("GNSS"))).toBe(true);
  });

  it("in 'all' mode keeps only a row with every ticked value — for features a weapon has together", () => {
    expect(matchesFacet(["iog", "datalink"], set("iog", "datalink"), set(), "all")).toBe(true);
    expect(matchesFacet(["iog"], set("iog", "datalink"), set(), "all")).toBe(false);
    expect(matchesFacet(["iog", "datalink"], set("iog"), set("datalink"), "all")).toBe(false);
    expect(matchesFacet([], set(), set(), "all")).toBe(true);
    expect(matchesFacet([], set(), set("irccm"), "all")).toBe(true);
  });

  it("reads a value both ticked and crossed out as crossed out, as its chip does", () => {
    // Only a hand-edited link can say both; the chip shows the cross.
    expect(matchesFacet(["GP"], set("ROCKET"), set("ROCKET"))).toBe(true);
    expect(matchesFacet(["ROCKET"], set("ROCKET"), set("ROCKET"))).toBe(false);
    expect(facetState("ROCKET", set("ROCKET"), set("ROCKET"))).toBe("out");
  });
});

describe("nextFacet", () => {
  it("goes from off to ticked to crossed out and back to off", () => {
    const one = nextFacet("ROCKET", set(), set());
    expect(facetState("ROCKET", one.ticked, one.crossed)).toBe("in");
    const two = nextFacet("ROCKET", one.ticked, one.crossed);
    expect(facetState("ROCKET", two.ticked, two.crossed)).toBe("out");
    const three = nextFacet("ROCKET", two.ticked, two.crossed);
    expect(facetState("ROCKET", three.ticked, three.crossed)).toBe("off");
    expect([three.ticked.size, three.crossed.size]).toEqual([0, 0]);
    expect([one.state, two.state, three.state]).toEqual(["in", "out", "off"]);
  });

  it("leaves every other value as it was", () => {
    const next = nextFacet("ROCKET", set("GP"), set("AGM"));
    expect(next.ticked).toEqual(set("GP", "ROCKET"));
    expect(next.crossed).toEqual(set("AGM"));
  });
});
