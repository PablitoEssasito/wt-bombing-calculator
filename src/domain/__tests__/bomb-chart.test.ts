import { describe, expect, it } from "vitest";
import { inArmamentChart, inView, kindsOf } from "../bomb-chart";

describe("inArmamentChart", () => {
  it("keeps every weapon the game catalogues, priced or not", () => {
    expect(inArmamentChart({ kind: "AAM", damageValue: null, source: "game" })).toBe(true);
    expect(inArmamentChart({ kind: "GP", damageValue: 2464 })).toBe(true);
  });

  it("drops a sheet row with nothing in it", () => {
    expect(inArmamentChart({ kind: "INC", damageValue: null })).toBe(false);
  });
});

describe("inView", () => {
  const kd88 = { chartName: "KD-88", kind: "AGM" as const, guidance: "tv+IOG+GNSS", damageValue: 2064 };
  const aim9 = { chartName: "AIM-9B", kind: "AAM" as const, guidance: "ir", damageValue: null };
  const mk82 = { chartName: "Mk 82", kind: "GP" as const, damageValue: 2464 };
  const bullpup = { chartName: "AGM-12B", kind: "AGM" as const, damageValue: 1500 };
  const b61 = { chartName: "☢B61", kind: "GP" as const, damageValue: 1200000 };

  it("shows what can hurt a base against bases", () => {
    expect(inView(kd88, "bases")).toBe(true);
    expect(inView(mk82, "bases")).toBe(true);
    expect(inView(aim9, "bases")).toBe(false);
    expect(inView({ chartName: "X", kind: "GP", damageValue: 0 }, "bases")).toBe(false);
  });

  it("leaves a nuclear bomb out against bases — a killstreak's, not a battle's — but not out of everything", () => {
    expect(inView(b61, "bases")).toBe(false);
    expect(inView(b61, "all")).toBe(true);
  });

  it("shows what steers itself at the ground as guided — a hand-flown missile too, an air-to-air one not", () => {
    expect(inView(kd88, "guided")).toBe(true);
    expect(inView(bullpup, "guided")).toBe(true);
    expect(inView(aim9, "guided")).toBe(false);
    expect(inView(mk82, "guided")).toBe(false);
    expect(inView({ chartName: "APKWS", kind: "ROCKET", guidance: "laser", damageValue: 400 }, "guided")).toBe(true);
  });

  it("shows everything under everything", () => {
    for (const row of [kd88, aim9, mk82]) expect(inView(row, "all")).toBe(true);
  });
});

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
