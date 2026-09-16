import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import imageData from "../../data/images.json";
import { matchAircraft, parseUnitList, type WikiUnit } from "../../../scripts/images/match";
import type { Aircraft } from "../types";

const aircraft = aircraftData as Aircraft[];
const images = imageData as Record<string, string>;

/**
 * The wiki names aircraft more formally than the source spreadsheet does, so the
 * matcher has to bridge several naming habits at once. These are the shapes that
 * actually occur in the data.
 */
const UNITS: WikiUnit[] = [
  { id: "lancaster_mk1", name: "Lancaster B Mk I", country: "britain" },
  { id: "lancaster_mk3", name: "Lancaster B Mk III", country: "britain" },
  { id: "wellington_mk1c", name: "Wellington Mk Ic", country: "britain" },
  { id: "wellington_mk1c_l", name: "Wellington Mk Ic/L", country: "britain" },
  { id: "b6n1", name: "B6N1 Model 11", country: "japan" },
  { id: "buccaneer_s1", name: "Buccaneer S.1", country: "britain" },
  { id: "z1007_s3", name: "Z.1007 bis serie 3", country: "italy" },
  { id: "pe-8_m82", name: "Pe-8", country: "ussr" },
  { id: "mirage_2000_5f", name: "Mirage 2000-5F", country: "france" },
  { id: "hampden_uk", name: "Hampden TB Mk I", country: "britain" },
  { id: "hampden_ussr", name: "▂Hampden TB Mk I", country: "ussr" },
];

const find = (name: string, nation: string) =>
  matchAircraft([{ id: "x", name, nation }], UNITS).matches.get("x");

describe("matchAircraft", () => {
  it("takes an exact name as given", () => {
    expect(find("Pe-8", "ussr")?.unit.id).toBe("pe-8_m82");
  });

  it("sees through the Mk the wiki inserts before a mark number", () => {
    expect(find("Lancaster I", "britain")?.unit.id).toBe("lancaster_mk1");
    expect(find("Lancaster III", "britain")?.unit.id).toBe("lancaster_mk3");
  });

  it("does not confuse a mark with a longer one that starts the same", () => {
    expect(find("Wellington Ic", "britain")?.unit.id).toBe("wellington_mk1c");
    expect(find("Wellington Ic/L", "britain")?.unit.id).toBe("wellington_mk1c_l");
  });

  it("reconciles the words each side spells out", () => {
    // "Mod." against "Model", and a bare number against "serie 3".
    expect(find("B6N1 Mod. 11", "japan")?.unit.id).toBe("b6n1");
    expect(find("Z.1007 bis 3", "italy")?.unit.id).toBe("z1007_s3");
  });

  it("matches a bare number against a designation that carries one", () => {
    expect(find("Buccaneer 1", "britain")?.unit.id).toBe("buccaneer_s1");
  });

  it("prefers the nation's own tree when two of them share a name", () => {
    expect(find("Hampden TB I", "britain")?.unit.id).toBe("hampden_uk");
    expect(find("Hampden TB I", "ussr")?.unit.id).toBe("hampden_ussr");
  });

  it("applies the aliases for names no rule could bridge", () => {
    expect(find("Mirage 2K-5F", "france")?.unit.id).toBe("mirage_2000_5f");
  });

  it("reports an aircraft the wiki simply does not have", () => {
    const { unmatched } = matchAircraft([{ id: "x", name: "Nonesuch IX", nation: "britain" }], UNITS);
    expect(unmatched).toHaveLength(1);
  });
});

describe("parseUnitList", () => {
  it("reads the table the wiki embeds in its aviation page", () => {
    const html = `<script>window.WT_UnitList = '[["a-20g","A-20G-25","usa",2,{}]]';</script>`;
    expect(parseUnitList(html)).toEqual([{ id: "a-20g", name: "A-20G-25", country: "usa" }]);
  });

  it("fails loudly if the wiki stops publishing it", () => {
    expect(() => parseUnitList("<html></html>")).toThrow(/WT_UnitList/);
  });
});

describe("the imported image map", () => {
  it("covers all but a handful of the fleet", () => {
    const covered = aircraft.filter((p) => images[p.id]).length;
    expect(covered / aircraft.length).toBeGreaterThan(0.99);
  });

  it("only points at aircraft we actually have", () => {
    const ids = new Set(aircraft.map((p) => p.id));
    for (const id of Object.keys(images)) expect(ids.has(id)).toBe(true);
  });
});
