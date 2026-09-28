import type { Bomb, BombKind } from "./types";

/**
 * A sheet row as the sheet printed it — undoing what an import overruled with
 * the game's figures (`sheet`). What the import matches against, so it never
 * steers by its own last answer, and what the planner compares a plan with.
 */
export function sheetView(bomb: Bomb): Bomb {
  const row: Bomb = { ...bomb, ...bomb.sheet };
  delete row.sheet;
  delete row.damageSource;
  delete row.guidance;
  delete row.aliasOf;
  return row;
}

/**
 * Whether a weapon gets a row in the armament chart, and a page, at all.
 *
 * Everything the game's own files catalogue does — an air-to-air missile or
 * a gun pod has figures worth showing even with nothing to do to a base. Not
 * a sheet row standing in for a weapon the game has under the same name
 * (`aliasOf`), which is that weapon's row twice, nor one the game has no file
 * for at all, which has nothing to show.
 */
export const inArmamentChart = (bomb: Pick<Bomb, "damageValue" | "kind" | "source" | "aliasOf">) =>
  !bomb.aliasOf && (bomb.damageValue !== null || bomb.kind === "ROCKET" || bomb.source === "game");

/**
 * A row as the armament chart is handed it: the figures its columns show and
 * nothing more, so the page does not ship every record whole. The extra
 * columns come off the weapon's own file, their labels already in the page's
 * language.
 */
export type ChartRow = Pick<
  Bomb,
  | "id"
  | "chartName"
  | "fullName"
  | "kind"
  | "guidance"
  | "nation"
  | "massKg"
  | "massLabel"
  | "tntKg"
  | "damageValue"
  | "damageSource"
  | "efficiency"
  | "usedByNations"
> & {
  launchRangeM?: number;
  machMax?: number;
  maxSpeedMs?: number;
  /** How long it steers for — a guided weapon's only, not an unguided one's self-destruct time. */
  guidanceTimeS?: number;
  warhead?: string;
  explosive?: string;
  explosiveMassKg?: number;
};

/** The armament chart's starting points: what can hit a base, what steers itself there, or everything. */
export const CHART_VIEWS = ["bases", "guided", "all"] as const;
export type ChartView = (typeof CHART_VIEWS)[number];

const GUIDED = new Set<BombKind>(["GNSS", "LAS", "TV", "IR", "RC", "AGM"]);

/**
 * A nuclear weapon, as the game marks one in its name ("☢B61"): carried only by
 * a killstreak's own aircraft, never taken into an ordinary battle.
 */
export const isNuclear = (bomb: Pick<Bomb, "chartName">) => bomb.chartName.startsWith("☢");

/**
 * Whether a row belongs in a view. "Against bases" is what an ordinary battle
 * can bring to one — so not a nuclear bomb, whose one-per-base would top the
 * list. "Guided" is anything aimed at the ground that steers — a guided bomb,
 * an air-to-ground missile, a guided rocket — but not an air-to-air missile,
 * which never goes for a base.
 */
export function inView(bomb: Pick<Bomb, "damageValue" | "kind" | "guidance" | "chartName">, view: ChartView): boolean {
  if (view === "bases") return (bomb.damageValue ?? 0) > 0 && !isNuclear(bomb);
  if (view === "guided") return bomb.kind !== "AAM" && (GUIDED.has(bomb.kind) || Boolean(bomb.guidance));
  return true;
}

/**
 * Every kind a bomb is filtered under: its seeker's, and satellite guidance's
 * too where it flies on satellite-aided INS ("laser+IOG+GNSS") — a Paveway IV
 * is laser-guided and a GNSS bomb both.
 */
export const kindsOf = (bomb: Pick<Bomb, "kind" | "guidance">): BombKind[] =>
  bomb.guidance?.includes("+GNSS") && bomb.kind !== "GNSS" ? [bomb.kind, "GNSS"] : [bomb.kind];

/**
 * What a bomb counts for in the bombing reward: the game pays by its own
 * price (`weaponDamage`), and prices nothing it gives no figure for — so an
 * estimate from its explosion model, however well it predicts what the blast
 * does to a base, adds nothing to the reward multiplier.
 */
export const rewardDamageOf = (bomb: Pick<Bomb, "damageValue" | "damageSource">): number | null =>
  bomb.damageSource === "estimate" ? 0 : bomb.damageValue;
