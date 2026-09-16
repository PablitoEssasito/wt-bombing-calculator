import type { BaseHp, Nation, VehicleCategory } from "./constants";

export type BombKind =
  | "GP"
  | "AP"
  | "DRAG"
  | "INC"
  | "MINE"
  | "GNSS"
  | "LAS"
  | "TV"
  | "IR"
  | "RC"
  | "ROCKET"
  | "OTHER";

export type Bomb = {
  id: string;
  /** Short name used by the loadout tabs — the join key between the two datasets. */
  chartName: string;
  fullName: string;
  kind: BombKind;
  massKg: number | null;
  /** Mass as printed in the source, e.g. "110 lb" — nations use different units. */
  massLabel: string;
  tntKg: number | null;
  /**
   * Damage one of these does to a base, in base hitpoints. Null for ordnance the
   * source chart does not price — rockets, and a handful of bombs that appear in
   * loadouts but are missing from the chart.
   */
  damageValue: number | null;
  /** damageValue per kg of carried mass; the 💡 column of the source chart. */
  efficiency: number | null;
  /**
   * Bombs-per-base as printed in the source chart, one entry per BASE_HP_TIERS
   * value. Kept so the test suite can check our formula against the source.
   */
  sheetCounts: number[] | null;
};

export type LoadoutItem = { bombId: string; count: number };

export type BaseLoadout = { items: LoadoutItem[] };

/** Which match BRs a schedule applies to, from the ▲/▼ markers. */
export type BrBracket = { kind: "max" | "min"; br: number };

/** What to drop on each base, for one BR bracket. */
export type Schedule = {
  bracket: BrBracket | null;
  baseHp: BaseHp;
  bases: BaseLoadout[];
  /** Bases beyond the ten the sheet has columns for, written there as "+ 2". */
  extraBases: number;
  /** 🎯 — bases this payload fully flattens. Only the sheet's own figure; null when it does not state one. */
  basesDestroyed: number | null;
  /** The source's explanation of which matches this schedule is for. */
  bracketNote: string | null;
};

/**
 * One way to arm the aircraft.
 *
 * Aircraft usually have several, trading bases hit against the reward multiplier:
 * a lighter loadout earns more per base, so the source recommends taking only as
 * much as the number of bases you actually intend to bomb.
 */
export type LoadoutOption = {
  /** 💡 — reward multiplier for bases, capped at 10 for bombers and 8 for fighters. */
  rewardMultiplier: number | null;
  /** The marker the source puts on this loadout: a caveat, a warning, or a recommendation. */
  noteMarker: "?" | "!" | "star" | null;
  /** What that marker says, when the import had an API key to read cell notes with. */
  note: string | null;
  /** One entry per BR bracket this loadout is described for, lowest first. */
  schedules: Schedule[];
};

export type Aircraft = {
  id: string;
  name: string;
  nation: Nation;
  rank: number;
  br: number;
  category: VehicleCategory;
  options: LoadoutOption[];
};

export type Meta = {
  sourceUrl: string;
  /** The source's own commentary on a nation's bombing, keyed by nation. */
  nationNotes: Record<string, string>;
  /** Whether this import could read cell notes, which need an API key. */
  hasNotes: boolean;
  sheetVersion: string | null;
  generatedAt: string;
  aircraftCount: number;
  bombCount: number;
};
