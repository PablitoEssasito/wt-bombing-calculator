import type { Nation } from "../../src/domain/constants";
import type { Bomb, BombKind } from "../../src/domain/types";
import { ROCKET_ORDNANCE } from "./rockets";

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
 * Loadout names pinned straight to a bomb id, for a chart row with no short
 * name of its own to alias to. A pinned id the chart no longer has falls back
 * to ordinary resolution, which then reports the name if it cannot place it.
 */
export const BOMB_ID_ALIASES: Record<string, string> = {
  // The chart's H.E.1000 is the retarded Mk.13 No.117, but every loadout using
  // it pictures the plain M.C. Mk.13 — a row listed with no short name, at the
  // same 5279 damage. Confirmed in game on the Harrier GR.3, which offers both.
  "H.E.1000": "1000-lb-h-e-m-c-mk-13",
};

/**
 * Aircraft names the sheet misspells against the game's own unit list.
 *
 * "Do 17 J-1" is not a vehicle War Thunder has ever shipped — the wiki's own
 * unit list has no do_17j_1, only do_217j_1, which matches this row's
 * nation, rank (I) and BR (2.0 RB) exactly (wiki.warthunder.com/unit/do_217j_1).
 * A dropped "2", not a judgment call, so it's corrected here rather than left
 * as a name nothing can match an image to.
 */
export const AIRCRAFT_NAME_CORRECTIONS: Record<string, string> = {
  "Do 17 J-1": "Do 217 J-1",
};

/**
 * Bombs that appear in loadouts but carry no damage value in the source — the
 * chart is simply missing these two rows outright. Carried through so the
 * schedules stay complete, and flagged so nothing tries to price them.
 */
export const UNPRICED_ORDNANCE: ReadonlyArray<{
  chartName: string;
  fullName: string;
  kind: BombKind;
}> = [
  { chartName: "FC1000", fullName: "Flam C 1000 (not in source chart)", kind: "INC" },
  { chartName: "130-2", fullName: "130 kg 130-2 (not in source chart)", kind: "GP" },
];

/**
 * Rockets. The Bomb Chart prices none of them — see `scripts/etl/rockets.ts`
 * for where their mass, TNT and damage figures come from; none of it is from
 * the sheet.
 */
export function unpricedBombs(): Bomb[] {
  const bombs = UNPRICED_ORDNANCE.map((o) => ({
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
    // Placeholder — index.ts overwrites this once the loadouts are parsed and
    // it can see who actually carries each bomb.
    usedByNations: [],
  }));

  const rockets = ROCKET_ORDNANCE.map((r) => ({
    id: slugifyBomb(r.chartName),
    chartName: r.chartName,
    fullName: r.fullName,
    kind: "ROCKET" as const,
    nation: null,
    massKg: r.massKg,
    massLabel: r.massLabel,
    tntKg: r.tntKg,
    damageValue: r.damageValue,
    efficiency: Math.round(r.damageValue / r.massKg),
    sheetCounts: null,
    usedByNations: [],
  }));

  return [...bombs, ...rockets];
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
 *
 * G.P.500: since sheet 2.27 the British block lists a Mk.III and a Mk.IV under
 * this one name, 1706 and 1711 damage, while the loadouts never say which. The
 * USSR's Hampden TB I reads it the way the British tab's own loadouts already
 * do — the block's first row, the Mk.III — though the game hangs it the Mk.IV.
 */
export const AMBIGUOUS_DEFAULT_NATION: Record<string, Nation> = {
  "Mk 77": "usa",
  "G.P.500": "britain",
};
