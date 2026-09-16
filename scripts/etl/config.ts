import type { Nation } from "../../src/domain/constants";

export const SHEET_ID = "1oNwp_MXszU5J2dcaz5IoCtSAQ-infPdOWhwtJXqtrwU";

export const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

/**
 * The gviz endpoint serves a public sheet as CSV without authentication.
 * The more obvious /export?format=csv returns a sign-in interstitial instead.
 */
export const csvUrl = (gid: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;

export const TABS = {
  bombChart: "1447098598",
  changelog: "343442140",
} as const;

export const NATION_TABS: Record<Nation, string> = {
  usa: "1966139895",
  germany: "407647011",
  ussr: "1916006133",
  britain: "549116604",
  japan: "985900344",
  china: "325556979",
  italy: "1107747621",
  france: "1521752922",
  sweden: "1922441272",
  israel: "1524248808",
};

/** Column layout of the Bomb Chart tab. */
export const BOMB_COL = {
  mass: 3,
  tnt: 4,
  chartName: 5,
  fullName: 6,
  kind: 7,
  /** Six columns of bombs-per-base, one per base hitpoint tier. */
  countsStart: 8,
  damage: 15,
  efficiency: 16,
} as const;

/** Column layout of the nation tabs. */
export const NATION_COL = {
  rank: 2,
  nameAndBr: 4,
  noteMarker: 5,
  /** Per-base loadouts live in this half-open range of columns. */
  basesStart: 6,
  basesEnd: 16,
  bracket: 16,
  /** Marker beside the tab heading, carrying the source's notes on the nation. */
  nationNote: 33,
  basesDestroyed: 17,
  rewardMultiplier: 18,
  category: 34,
} as const;

/**
 * Nation blocks of the Bomb Chart tab, in the order they appear.
 *
 * The tab marks these with flag images, which sit over the grid rather than in
 * cells, so no anonymous export carries them: they are absent from the gviz CSV,
 * and the XLSX export that would embed them refuses without a signed-in session.
 * The blocks are therefore recovered from the damage column, which climbs within
 * a block and drops at every boundary. The ETL checks that answer twice — the
 * count of blocks, and whether each block's bombs are carried mostly by the
 * nation it was assigned to.
 */
export const BOMB_CHART_NATION_ORDER: readonly Nation[] = [
  "usa",
  "germany",
  "ussr",
  "britain",
  "japan",
  "china",
  "italy",
  "france",
  "sweden",
  "israel",
];
