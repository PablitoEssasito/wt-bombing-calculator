import { describe, expect, it } from "vitest";
import { kindsOf } from "../bomb-chart";

describe("kindsOf", () => {
  it("files a seeker on satellite-aided INS under GNSS as well", () => {
    expect(kindsOf({ kind: "LAS", navigation: "INS/GNSS" })).toEqual(["LAS", "GNSS"]);
  });

  it("files INS alone, or no navigation, under the seeker only", () => {
    expect(kindsOf({ kind: "IR", navigation: "INS" })).toEqual(["IR"]);
    expect(kindsOf({ kind: "LAS" })).toEqual(["LAS"]);
    expect(kindsOf({ kind: "GNSS" })).toEqual(["GNSS"]);
  });
});
