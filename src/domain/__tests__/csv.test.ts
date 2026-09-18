import { describe, expect, it } from "vitest";
import { cell, flatten, parseCsv } from "../../../scripts/etl/csv";

describe("parseCsv", () => {
  it("splits ordinary fields on commas", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('"a,b",c')).toEqual([["a,b", "c"]]);
  });

  it("keeps a newline inside a quoted field, the shape a wrapped cell takes", () => {
    // "FC250 × 1" wraps to "FC250\n× 1" in the sheet's own export.
    expect(parseCsv('"FC250\n× 1",next')).toEqual([["FC250\n× 1", "next"]]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('"say ""hi"""')).toEqual([['say "hi"']]);
  });
});

describe("cell", () => {
  it("reads past a row the export truncated to fewer columns", () => {
    expect(cell(["a", "b"], 5)).toBe("");
  });
});

describe("flatten", () => {
  it("joins a wrapped cell's lines with a single space", () => {
    expect(flatten("FC250\n× 1")).toBe("FC250 × 1");
  });

  it("drops blank lines a wrap can leave behind", () => {
    expect(flatten("a\n\nb")).toBe("a b");
  });
});
