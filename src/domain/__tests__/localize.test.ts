import { describe, expect, it } from "vitest";
import { langColumns, parseLangCsv, splitRow } from "../../../scripts/localize/parse";

const CSV = [
  '"<ID|readonly|noverify>";"<English>";"<French>";"<Russian>";"<Polish>";"<Comments>"',
  '"il_2_1941_shop";"IL-2 (1941)";"IL-2 (1941)";"Ил-2 (1941)";"Ił-2 (1941)";;',
  '"weapons/us_1000lbs";"1000 lb AN-M65A1 bomb ";"";"1000-фн бомба AN-M65A1";"Bomba 1000 lb AN-M65A1​";;',
  '"quote";"a ""quoted"" word";"";"";"";;',
].join("\n");

describe("game localisation files", () => {
  it("splits a row on its separators, not inside quotes", () => {
    expect(splitRow('"a;b";"c";;')).toEqual(["a;b", "c", "", ""]);
  });

  it("reads each language's column by the header's own name", () => {
    const pl = langColumns(parseLangCsv(CSV), "English", "Polish");
    const ru = langColumns(parseLangCsv(CSV), "English", "Russian");
    expect(pl.get("il_2_1941_shop")).toEqual({ english: "IL-2 (1941)", translated: "Ił-2 (1941)" });
    expect(ru.get("il_2_1941_shop")?.translated).toBe("Ил-2 (1941)");
  });

  it("trims stray spaces and zero-width spaces the files carry", () => {
    const pl = langColumns(parseLangCsv(CSV), "English", "Polish");
    expect(pl.get("weapons/us_1000lbs")).toEqual({
      english: "1000 lb AN-M65A1 bomb",
      translated: "Bomba 1000 lb AN-M65A1",
    });
  });

  it("drops the marks the game's font draws as nation icons", () => {
    const table = parseLangCsv(
      ['"<ID>";"<English>";"<Polish>"', '"il_28_hungary_shop";"Il-28";"◊Ił-28"'].join("\n"),
    );
    expect(langColumns(table, "English", "Polish").get("il_28_hungary_shop")?.translated).toBe("Ił-28");
  });

  it("reads a doubled quote as one", () => {
    const table = parseLangCsv(CSV);
    expect(langColumns(table, "English", "Polish").get("quote")?.english).toBe('a "quoted" word');
  });
});
