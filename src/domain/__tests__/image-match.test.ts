import { describe, expect, it } from "vitest";
import aircraftData from "../../data/aircraft.json";
import imageData from "../../data/images.json";
import squadronData from "../../data/squadron.json";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { matchAircraft, parseUnitList, type WikiUnit } from "../../../scripts/images/match";
import type { Aircraft } from "../types";

const aircraft = aircraftData as Aircraft[];
const images = imageData as Record<string, string>;
const squadron = squadronData as string[];

/**
 * The wiki page the import last read, kept so a test can re-run the real match.
 *
 * `.cache` is not committed, so this is there after an import and absent on a
 * fresh clone — hence the skip below rather than a failure that says nothing
 * about the code.
 */
const WIKI_CACHE = path.join(process.cwd(), ".cache", "wiki-aviation.html");
const hasWikiCache = existsSync(WIKI_CACHE);

/**
 * The wiki names aircraft more formally than the source spreadsheet does, so the
 * matcher has to bridge several naming habits at once. These are the shapes that
 * actually occur in the data.
 */
/** Every fixture unit is plain tech-tree unless a test says otherwise. */
const unit = (id: string, name: string, country: string, rewardKind: 0 | 1 | 2 = 0): WikiUnit => ({
  id,
  name,
  country,
  rewardKind,
  vehicleType: null,
});

const UNITS: WikiUnit[] = [
  unit("lancaster_mk1", "Lancaster B Mk I", "britain"),
  unit("lancaster_mk3", "Lancaster B Mk III", "britain"),
  unit("wellington_mk1c", "Wellington Mk Ic", "britain"),
  unit("wellington_mk1c_l", "Wellington Mk Ic/L", "britain"),
  unit("b6n1", "B6N1 Model 11", "japan"),
  unit("buccaneer_s1", "Buccaneer S.1", "britain"),
  unit("z1007_s3", "Z.1007 bis serie 3", "italy"),
  unit("pe-8_m82", "Pe-8", "ussr"),
  unit("mirage_2000_5f", "Mirage 2000-5F", "france"),
  unit("hampden_uk", "Hampden TB Mk I", "britain"),
  unit("hampden_ussr", "▂Hampden TB Mk I", "ussr"),
  unit("f-4ej", "F-4EJ Phantom II", "japan"),
  unit("f-4ej_adtw", "F-4EJ ADTW", "japan"),
  unit("f-4ej_kai", "F-4EJ Kai Phantom II", "japan"),
  unit("mig_29m", "MiG-29M (9-15)", "ussr", 2),
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

  it("leaves a variant alone when another row names it outright", () => {
    // Three units start with "F-4EJ" and none matches the plain row exactly, so
    // it falls through to guessing. Taking the shortest name on its own handed
    // it the ADTW — the very unit the row below it names — leaving the
    // tech-tree F-4EJ unused and two rows sharing one aircraft's hardpoints.
    const { matches } = matchAircraft(
      [
        { id: "plain", name: "F-4EJ", nation: "japan" },
        { id: "adtw", name: "F-4EJ ADTW", nation: "japan" },
      ],
      UNITS,
    );

    expect(matches.get("adtw")?.unit.id).toBe("f-4ej_adtw");
    expect(matches.get("plain")?.unit.id).toBe("f-4ej");
  });

  it("claims regardless of the order the rows arrive in", () => {
    const reversed = matchAircraft(
      [
        { id: "adtw", name: "F-4EJ ADTW", nation: "japan" },
        { id: "plain", name: "F-4EJ", nation: "japan" },
      ],
      UNITS,
    );
    expect(reversed.matches.get("plain")?.unit.id).toBe("f-4ej");
  });

  it("shares a unit rather than giving up when nothing is left unclaimed", () => {
    // Two rows, one plausible unit: a picture shared with another row still
    // beats a tile with no picture at all.
    const { matches, unmatched } = matchAircraft(
      [
        { id: "a", name: "Lancaster", nation: "britain" },
        { id: "b", name: "Lancaster", nation: "britain" },
      ],
      UNITS,
    );
    expect(unmatched).toEqual([]);
    expect(matches.get("a")?.unit.id).toBe(matches.get("b")?.unit.id);
  });

  it("reports an aircraft the wiki simply does not have", () => {
    const { unmatched } = matchAircraft([{ id: "x", name: "Nonesuch IX", nation: "britain" }], UNITS);
    expect(unmatched).toHaveLength(1);
  });
});

describe("parseUnitList", () => {
  it("reads the table the wiki embeds in its aviation page", () => {
    const html = `<script>window.WT_UnitList = '[["a-20g","A-20G-25","usa",2,{}]]';</script>`;
    expect(parseUnitList(html)).toEqual([
      { id: "a-20g", name: "A-20G-25", country: "usa", rewardKind: 0, vehicleType: null },
    ]);
  });

  it("reads a premium or squadron marker off the row's sixth field", () => {
    const html =
      `<script>window.WT_UnitList = '[` +
      `["p47_premium","P-47 Premium","usa",4,{},1,[],[]],` +
      `["mig_29m","MiG-29M","ussr",8,{},2,[],[]]` +
      `]';</script>`;
    const units = parseUnitList(html);
    expect(units.map((u) => u.rewardKind)).toEqual([1, 2]);
  });

  it("reads the aircraft's class off the row's eighth field", () => {
    const html =
      `<script>window.WT_UnitList = '[` +
      `["a-20g","A-20G-25","usa",2,{},0,[],[["assault","Strike aircraft","#bde9b5"],[],""]],` +
      `["a5m4","A5M4","japan",1,{},0,[],[["fighter","Fighter","#ffac6f"],[],""]],` +
      `["odd","Odd","usa",1,{},0,[],[["blimp","Blimp","#fff"],[],""]]` +
      `]';</script>`;
    const units = parseUnitList(html);
    expect(units.map((u) => u.vehicleType)).toEqual(["assault", "fighter", null]);
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

describe("the imported squadron-vehicle list", () => {
  it("names only aircraft we have a picture for, once each", () => {
    for (const id of squadron) expect(images).toHaveProperty(id);
    expect(new Set(squadron).size).toBe(squadron.length);
  });

  it("is a small, real minority of the fleet, not a parsing accident", () => {
    // 13 on the last import — a handful, never near-empty and never near-total.
    expect(squadron.length).toBeGreaterThan(0);
    expect(squadron.length).toBeLessThan(aircraft.length / 10);
  });

  it("carries the wiki's reward marker through to the matched unit", () => {
    // The gold/green tint on a tile reads unit.rewardKind off the match, so the
    // field has to survive whichever rule found the unit, not just an exact one.
    expect(find("MiG-29M (9-15)", "ussr")?.unit.rewardKind).toBe(2);
  });

  it.skipIf(!hasWikiCache)("never lets a guess take a unit another aircraft names outright", () => {
    // The map decides which flight model the loadout creator offers, not just
    // which picture to draw, so a unit claimed by an exact name must not also
    // be handed to a row that only half-matches it.
    const units = parseUnitList(readFileSync(WIKI_CACHE, "utf8"));
    const { matches } = matchAircraft(aircraft, units);

    const claimed = new Set(
      [...matches.values()].filter((m) => m.method !== "ambiguous").map((m) => m.unit.id),
    );
    const stolen = [...matches]
      .filter(([, m]) => m.method === "ambiguous" && claimed.has(m.unit.id))
      .map(([id]) => id);

    expect(stolen).toEqual([]);
  });
});
