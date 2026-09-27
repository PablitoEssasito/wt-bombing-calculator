import { describe, expect, it } from "vitest";
import { kindsOf } from "../bomb-chart";

describe("kindsOf", () => {
  it("files a seeker on satellite-aided INS under GNSS as well", () => {
    expect(kindsOf({ kind: "LAS", guidance: "laser+IOG+GNSS" })).toEqual(["LAS", "GNSS"]);
  });

  it("files INS alone, or no navigation, under the seeker only", () => {
    expect(kindsOf({ kind: "IR", guidance: "ir+IOG" })).toEqual(["IR"]);
    expect(kindsOf({ kind: "LAS" })).toEqual(["LAS"]);
    expect(kindsOf({ kind: "GNSS" })).toEqual(["GNSS"]);
  });
});
