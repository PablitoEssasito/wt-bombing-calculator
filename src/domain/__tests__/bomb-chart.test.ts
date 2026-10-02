import { describe, expect, it } from "vitest";
import { familyOf, groupValues, inArmamentChart, inTab, SECTIONS, sectionOf, TAB_GROUPS, TABS, type ChartTab } from "../bomb-chart";
import { WEAPON_TAGS, type WeaponCategory, type WeaponTag } from "../weapon-tags";

describe("inArmamentChart", () => {
  it("keeps every weapon the game catalogues, priced or not", () => {
    expect(inArmamentChart({ kind: "AAM", damageValue: null, source: "game" })).toBe(true);
    expect(inArmamentChart({ kind: "GP", damageValue: 2464 })).toBe(true);
  });

  it("drops a sheet row with nothing in it", () => {
    expect(inArmamentChart({ kind: "INC", damageValue: null })).toBe(false);
  });
});

/** The tabs that gather several categories rather than file one. */
const GATHERING: readonly ChartTab[] = ["bases", "ground", "all"];

describe("inTab", () => {
  const row = (category: WeaponCategory, damageValue: number | null = 2464, chartName = "X", tags: WeaponTag[] = []) => ({
    chartName,
    category,
    damageValue,
    tags,
  });

  it("shows what can hurt a base on the bases tab, a nuclear bomb not — a killstreak's, not a battle's", () => {
    expect(inTab(row("agm", 2064), "bases")).toBe(true);
    expect(inTab(row("bomb"), "bases")).toBe(true);
    expect(inTab(row("aam", null), "bases")).toBe(false);
    expect(inTab(row("bomb", 0), "bases")).toBe(false);
    expect(inTab(row("bomb", 1200000, "☢B61"), "bases")).toBe(false);
    expect(inTab(row("bomb", 1200000, "☢B61"), "nuclear")).toBe(true);
  });

  it("files each row under its category's tab, torpedoes on their own, and mines and gun pods under other", () => {
    const tabsOf = (category: WeaponCategory, tags: WeaponTag[] = []) =>
      TABS.filter((tab) => !GATHERING.includes(tab) && inTab(row(category, null, "X", tags), tab));
    expect(tabsOf("bomb")).toEqual(["bomb"]);
    expect(TABS.filter((tab) => !GATHERING.includes(tab) && inTab(row("bomb", 1200000, "☢B61", ["nuclear"]), tab))).toEqual([
      "nuclear",
    ]);
    expect(tabsOf("rocket")).toEqual(["rocket"]);
    expect(tabsOf("agm")).toEqual(["agm"]);
    expect(tabsOf("torpedo")).toEqual(["torpedo"]);
    for (const category of ["mine", "gun"] as const) expect(tabsOf(category)).toEqual(["other"]);
  });

  it("splits air-to-air missiles by seeker: radar on one tab, IR on another, one flown by hand under other", () => {
    const tabsOf = (tags: WeaponTag[]) => TABS.filter((tab) => !GATHERING.includes(tab) && inTab(row("aam", null, "X", tags), tab));
    expect(tabsOf(["sarh"])).toEqual(["aamRadar"]);
    expect(tabsOf(["arh", "iog", "datalink"])).toEqual(["aamRadar"]);
    expect(tabsOf(["ir", "allAspect", "irccm"])).toEqual(["aamIr"]);
    // X-4: a wire to the launching aircraft, neither radar nor IR.
    expect(tabsOf(["mclos"])).toEqual(["other"]);
  });

  it("gathers everything air-to-ground under ground: bombs, rockets and air-to-ground missiles", () => {
    for (const category of ["bomb", "rocket", "agm"] as const) expect(inTab(row(category, null), "ground")).toBe(true);
    expect(inTab(row("bomb", 1200000, "☢B61", ["nuclear"]), "ground")).toBe(true);
    for (const category of ["aam", "torpedo", "mine", "gun"] as const) expect(inTab(row(category, null, "X", ["ir"]), "ground")).toBe(false);
  });

  it("shows everything under all", () => {
    for (const category of ["bomb", "aam", "gun"] as const) expect(inTab(row(category, null), "all")).toBe(true);
  });
});

describe("the sections", () => {
  it("hold every tab exactly once", () => {
    expect(SECTIONS.flatMap((section) => section.tabs).sort()).toEqual([...TABS].sort());
  });

  it("put the two views before the categories", () => {
    expect(SECTIONS.map((section) => `${section.kind}:${section.id}`)).toEqual([
      "view:bases",
      "view:all",
      "category:ground",
      "category:air",
      "category:torpedo",
      "category:other",
    ]);
  });

  it("open a section on its whole, and find the section a tab is in", () => {
    expect(SECTIONS.find((section) => section.id === "ground")!.tabs).toEqual(["ground", "bomb", "rocket", "agm", "nuclear"]);
    expect(sectionOf("bomb").id).toBe("ground");
    expect(sectionOf("nuclear").id).toBe("ground");
    expect(sectionOf("aamIr").id).toBe("air");
    expect(sectionOf("all").id).toBe("all");
  });
});

describe("the tabs' filter groups", () => {
  const ids = (tab: ChartTab) => TAB_GROUPS[tab].map((group) => group.id);

  it("offers every tag on some tab", () => {
    const offered = new Set(Object.values(TAB_GROUPS).flatMap((groups) => groups.flatMap((g) => (g.axis === "tag" ? g.values : []))));
    for (const tag of WEAPON_TAGS) expect(offered, tag).toContain(tag);
  });

  it("never lists one tag in two groups of a tab", () => {
    for (const tab of TABS) {
      const tags = TAB_GROUPS[tab].flatMap((g) => (g.axis === "tag" ? g.values : []));
      expect(new Set(tags).size, tab).toBe(tags.length);
    }
  });

  it("gives radar missiles SARH and ARH, and IOG, a data link and GNSS together", () => {
    expect(ids("aamRadar")).toEqual(["guidance", "features"]);
    const [guidance, features] = TAB_GROUPS.aamRadar;
    expect(guidance).toMatchObject({ mode: "any", values: ["sarh", "arh"] });
    expect(features).toMatchObject({ mode: "all", values: ["iog", "datalink", "gnssAid"] });
  });

  it("gives IR missiles their aspect, and IRCCM among what they have besides", () => {
    expect(ids("aamIr")).toEqual(["aspect", "features"]);
    const [aspect, features] = TAB_GROUPS.aamIr;
    expect(aspect).toMatchObject({ mode: "any", values: ["rearAspect", "allAspect"] });
    expect(features.mode).toBe("all");
    expect(features.values[0]).toBe("irccm");
  });

  it("gives bombs their type, rockets their warhead, and every tab with a mix its category", () => {
    expect(ids("bomb")).toEqual(["type", "guidance", "features"]);
    expect(ids("rocket")).toEqual(["guidance", "warhead"]);
    expect(ids("agm")).toEqual(["guidance", "features", "warhead"]);
    for (const tab of ["bases", "other", "all"] as const) expect(ids(tab)[0]).toBe("category");
  });
});

describe("familyOf", () => {
  const row = (category: WeaponCategory, tags: WeaponTag[]) => ({ chartName: "X", damageValue: null, category, tags });

  it("keeps a guided bomb with guided bombs, apart from iron ones", () => {
    expect(familyOf(row("bomb", ["gp", "laser"]))).toBe(familyOf(row("bomb", ["sap", "tv", "iog"])));
    expect(familyOf(row("bomb", ["drag", "unguided"]))).toBe(familyOf(row("bomb", ["gp", "unguided"])));
    expect(familyOf(row("bomb", ["gp", "laser"]))).not.toBe(familyOf(row("bomb", ["gp", "unguided"])));
  });

  it("keeps a nuclear bomb with nuclear ones, apart from iron bombs", () => {
    const nuclear = { ...row("bomb", ["nuclear", "unguided"]), chartName: "☢B61" };
    expect(familyOf(nuclear)).toBe(familyOf({ ...nuclear, chartName: "☢RDS-4" }));
    expect(familyOf(nuclear)).not.toBe(familyOf(row("bomb", ["gp", "unguided"])));
  });

  it("keeps an air-to-air missile with those on its own tab, radar or IR", () => {
    expect(familyOf(row("aam", ["sarh"]))).toBe(familyOf(row("aam", ["arh", "iog", "datalink"])));
    expect(familyOf(row("aam", ["ir", "rearAspect"]))).not.toBe(familyOf(row("aam", ["arh"])));
    expect(familyOf(row("aam", ["mclos"]))).not.toBe(familyOf(row("aam", ["ir", "allAspect"])));
  });

  it("never pairs two categories", () => {
    expect(familyOf(row("agm", ["laser", "he"]))).not.toBe(familyOf(row("bomb", ["gp", "laser"])));
    expect(familyOf(row("mine", []))).not.toBe(familyOf(row("bomb", ["gp", "unguided"])));
  });
});

describe("groupValues", () => {
  const row = { category: "aam" as const, tags: ["ir", "allAspect", "irccm"] as WeaponTag[] };

  it("reads a row's category, or the tags the group lists", () => {
    const [category] = TAB_GROUPS.all;
    expect(groupValues(row, category)).toEqual(["aam"]);
    const [aspect] = TAB_GROUPS.aamIr;
    expect(groupValues(row, aspect)).toEqual(["allAspect"]);
  });
});
