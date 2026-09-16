import type { Nation } from "../../src/domain/constants";
import type { Bomb, BombKind } from "../../src/domain/types";

/**
 * Loadout cells that name a bomb differently from the Bomb Chart tab, and that
 * case-and-punctuation normalisation alone does not reconcile.
 */
export const BOMB_ALIASES: Record<string, string> = {
  // The chart splits this into an early and a late mark; the loadouts do not.
  // Resolved from the Brigand B 1, which takes two of them against a 10 000 HP
  // base — a count only the late mark's damage value produces.
  "G.P.1000": "G.P.1000(l)",
  // Shorthand, from a cell that also omits the × separators.
  M30A1: "AN-M30A1",
  M57: "AN-M57",
};

/**
 * Ordnance that appears in loadouts but carries no damage value in the source.
 *
 * Rockets are simply absent from the Bomb Chart. Their damage cannot be inferred
 * from the schedules either: every rocket entry sits in a base that also carries
 * bombs, so the counts bound the pair rather than the rocket. FC1000 and 130-2
 * are bombs the chart is missing outright. All of them are carried through so the
 * schedules stay complete, and are flagged so nothing tries to price them.
 */
export const UNPRICED_ORDNANCE: ReadonlyArray<{
  chartName: string;
  fullName: string;
  kind: BombKind;
}> = [
  { chartName: "HVAR", fullName: "HVAR rocket", kind: "ROCKET" },
  { chartName: "Zuni", fullName: "Zuni Mk 32 rocket", kind: "ROCKET" },
  { chartName: "FFAR", fullName: "FFAR Mighty Mouse rocket", kind: "ROCKET" },
  { chartName: "RP-3", fullName: "RP-3 rocket", kind: "ROCKET" },
  { chartName: "M8", fullName: "M8 rocket", kind: "ROCKET" },
  { chartName: "FC1000", fullName: "Flam C 1000 (not in source chart)", kind: "INC" },
  { chartName: "130-2", fullName: "130 kg 130-2 (not in source chart)", kind: "GP" },
];

export function unpricedBombs(): Bomb[] {
  return UNPRICED_ORDNANCE.map((o) => ({
    id: slugifyBomb(o.chartName),
    chartName: o.chartName,
    fullName: o.fullName,
    kind: o.kind,
    nation: null,
    massKg: null,
    massLabel: "",
    tntKg: null,
    damageValue: null,
    efficiency: null,
    sheetCounts: null,
  }));
}

export function slugifyBomb(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "bomb"
  );
}

/** Lowercased, stripped of punctuation — "Mk82", "Mk 82" and "mk-82" all collapse here. */
export function normalizeBombName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Names that two nations' blocks define differently, and which nation's version
 * a loadout means when its own block does not define it.
 *
 * Mk 77: the US chart prices it at 10 860 and the British at 12 943. The A-4B and
 * AV-8C both take three against a 25 900 HP base, and since the schedules always
 * state the minimum, two must not be enough — which rules the British value out
 * (2 × 12 943 would already clear the 23 357 needed).
 */
export const AMBIGUOUS_DEFAULT_NATION: Record<string, Nation> = {
  "Mk 77": "usa",
};
