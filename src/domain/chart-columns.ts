import type { ChartRow, ChartTab } from "./bomb-chart";

/**
 * The armament chart's columns, and which a tab shows. A tab against bases
 * shows what it takes to bring one down; an air-to-air missile does nothing to
 * a base, so its tabs show what a pilot picks one by — its seeker, its reach,
 * how hard it turns.
 */
export const COLUMN_IDS = [
  "needed",
  "damage",
  "mass",
  "tnt",
  "efficiency",
  "kind",
  "aspect",
  "irccm",
  "seeker",
  "range",
  "speed",
  "loadFactor",
  "guidanceTime",
  "warhead",
  "explosive",
  "charge",
] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];
export type Sort = "name" | ColumnId;
export type SortDir = "asc" | "desc";

/** Columns off the weapon's own file, shown on request where a tab does not show them already. */
export const EXTRA_COLUMNS = ["range", "speed", "guidanceTime", "warhead", "explosive", "charge"] as const satisfies readonly ColumnId[];
export type ExtraColumn = (typeof EXTRA_COLUMNS)[number];

const AGAINST_BASES: readonly ColumnId[] = ["needed", "damage", "mass", "tnt", "efficiency", "kind"];

export const TAB_COLUMNS: Record<ChartTab, readonly ColumnId[]> = {
  bases: AGAINST_BASES,
  bomb: AGAINST_BASES,
  rocket: AGAINST_BASES,
  all: AGAINST_BASES,
  agm: ["needed", "damage", "kind", "range", "mass", "tnt"],
  aamRadar: ["kind", "seeker", "range", "speed", "loadFactor", "mass"],
  aamIr: ["aspect", "irccm", "seeker", "range", "speed", "loadFactor", "mass"],
  other: ["mass", "tnt", "kind"],
};

/** The extra columns a tab can add: those it does not show already. */
export const extrasFor = (tab: ChartTab): ExtraColumn[] =>
  EXTRA_COLUMNS.filter((column) => !TAB_COLUMNS[tab].includes(column));

/** Every column a tab shows: its own, then the extras ticked that it lacks. */
export const columnsFor = (tab: ChartTab, extras: ReadonlySet<ExtraColumn>): ColumnId[] => [
  ...TAB_COLUMNS[tab],
  ...extrasFor(tab).filter((column) => extras.has(column)),
];

/**
 * Which direction a column starts in on its first click: text A-Z; for a
 * number, whichever end is more interesting first — fewest per base, heaviest
 * hitter, longest reach, hardest turn.
 */
export const DEFAULT_DIR: Record<Sort, SortDir> = {
  name: "asc",
  needed: "asc",
  damage: "desc",
  mass: "desc",
  tnt: "desc",
  efficiency: "desc",
  kind: "asc",
  aspect: "desc",
  irccm: "desc",
  seeker: "desc",
  range: "desc",
  speed: "desc",
  loadFactor: "desc",
  guidanceTime: "desc",
  warhead: "asc",
  explosive: "asc",
  charge: "desc",
};

/** A tab's own order, where the page's sort names a column it does not show. */
const TAB_SORT: Record<ChartTab, Sort> = {
  bases: "needed",
  bomb: "needed",
  rocket: "needed",
  all: "needed",
  agm: "needed",
  aamRadar: "range",
  aamIr: "range",
  other: "name",
};

export function sortFor(
  tab: ChartTab,
  sort: Sort,
  dir: SortDir,
  extras: ReadonlySet<ExtraColumn> = new Set(),
): { sort: Sort; dir: SortDir } {
  if (sort === "name" || columnsFor(tab, extras).includes(sort)) return { sort, dir };
  return { sort: TAB_SORT[tab], dir: DEFAULT_DIR[TAB_SORT[tab]] };
}

/** The speed of sound the game's Mach figures are read against, to sort them beside m/s ones. */
const MACH_MS = 343;

export type SortableRow = { bomb: ChartRow; needed: number | null };

/** What a row sorts by in a column. `typeOf` is the Type column's own wording, which it sorts by. */
export function sortKeyOf(row: SortableRow, column: Sort, typeOf: (bomb: ChartRow) => string): number | string | null {
  const { bomb } = row;
  switch (column) {
    case "name":
      return bomb.chartName || bomb.fullName;
    case "needed":
      return row.needed;
    case "damage":
      return bomb.damageValue;
    case "mass":
      return bomb.massKg;
    case "tnt":
      return bomb.tntKg;
    case "efficiency":
      return bomb.efficiency;
    case "kind":
      return typeOf(bomb);
    case "aspect":
      return bomb.tags.includes("allAspect") ? 1 : bomb.tags.includes("rearAspect") ? 0 : null;
    case "irccm":
      return bomb.tags.includes("irccm") ? 1 : 0;
    case "seeker":
      return bomb.seekerRangeM ?? null;
    case "range":
      return bomb.launchRangeM ?? null;
    case "speed":
      return bomb.machMax !== undefined ? bomb.machMax * MACH_MS : (bomb.maxSpeedMs ?? null);
    case "loadFactor":
      return bomb.loadFactorMax ?? null;
    case "guidanceTime":
      return bomb.guidanceTimeS ?? null;
    case "warhead":
      return bomb.warhead ?? null;
    case "explosive":
      return bomb.explosive ?? null;
    case "charge":
      return bomb.explosiveMassKg ?? null;
  }
}

/**
 * Orders two rows by one column, nulls always last regardless of direction —
 * a bomb missing a TNT figure (incendiaries have none) shouldn't jump to the
 * top just because you flipped to "smallest first". Ties fall back to name,
 * so equal values still land in a stable, readable order.
 */
export function compareRows(
  a: SortableRow,
  b: SortableRow,
  column: Sort,
  dir: SortDir,
  typeOf: (bomb: ChartRow) => string,
): number {
  const av = sortKeyOf(a, column, typeOf);
  const bv = sortKeyOf(b, column, typeOf);

  let cmp: number;
  if (av === null || bv === null) {
    if (av === null && bv === null) cmp = 0;
    else return av === null ? 1 : -1;
  } else if (typeof av === "string" || typeof bv === "string") {
    cmp = String(av).localeCompare(String(bv));
  } else {
    cmp = av - bv;
  }

  const directed = dir === "asc" ? cmp : -cmp;
  if (directed !== 0 || column === "name") return directed;
  return compareRows(a, b, "name", "asc", typeOf);
}
