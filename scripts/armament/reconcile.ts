import { NATIONS, type Nation } from "../../src/domain/constants";
import type { Bomb, BombKind, WeaponStats } from "../../src/domain/types";
import type { Round } from "./stores";

/**
 * The armament table's rows, the game's files over the sheet.
 *
 * A sheet row keeps its name, its place in the loadouts and its id, but every
 * figure the game's own files state in one voice — damage to a base, mass,
 * TNT, guidance — comes from the game, and what the sheet printed instead is
 * kept beside it (`Bomb.sheet`). Every weapon the sheet has no row for gets a
 * row of the game's own.
 */

type SheetFigures = NonNullable<Bomb["sheet"]>;
const OVERRULED = ["kind", "massKg", "massLabel", "tntKg", "damageValue", "efficiency"] as const satisfies readonly (keyof SheetFigures)[];

/** A sheet row as the sheet printed it — undoing what a previous import overruled. */
export function sheetView(bomb: Bomb): Bomb {
  const row: Bomb = { ...bomb, ...bomb.sheet };
  delete row.sheet;
  delete row.damageSource;
  delete row.guidance;
  return row;
}

/** The seeker a guided bomb's kind follows. */
const KIND_OF_SEEKER: Record<string, BombKind> = { laser: "LAS", ir: "IR", tv: "TV", sns: "GNSS" };
const GUIDED: ReadonlySet<BombKind> = new Set(["GNSS", "LAS", "IR", "TV"]);

/** Figures the game's files give within a hair of each other are one figure. */
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The one value every entry agrees on, or undefined where they differ or say nothing. */
function agreed<T>(values: T[], same: (a: T, b: T) => boolean = (a, b) => a === b): T | undefined {
  if (values.length === 0) return undefined;
  return values.every((value) => same(value, values[0])) ? values[0] : undefined;
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** Mass as the game's tooltip writes it: pounds where the file states them, else kilograms. */
export function massLabelOf(kg: number, lbs: number | undefined): string {
  if (lbs) return `${round2(lbs)} lb`;
  return `${round2(kg)} kg`;
}

/** What the rounds a row prices as say about it, where they all say the same. */
function figuresOf(members: Round[]) {
  const priced = members.filter((r) => r.damageSource === "game");
  const estimated = members.filter((r) => r.damageSource === "estimate");
  const damageFrom = priced.length > 0 ? priced : estimated;
  const masses = members.map((r) => r.stats.massKg).filter((kg): kg is number => kg !== undefined);
  return {
    damage: damageFrom.length > 0 ? mostCommon(damageFrom.map((r) => r.damage!)) : null,
    damageSource: priced.length > 0 ? ("game" as const) : estimated.length > 0 ? ("estimate" as const) : null,
    massKg: masses.length === members.length ? agreed(masses, close) : undefined,
    massLbs: agreed(members.map((r) => r.stats.massLbs ?? 0), close) || undefined,
    // A fire bomb burns rather than blasts; the tooltip gives it no TNT figure.
    tntKg: agreed(
      members.map((r) => (r.incendiary ? null : r.tntKg)),
      (a, b) => (a === null || b === null ? a === b : close(a, b)),
    ),
    guidance: agreed(members.map((r) => r.stats.guidance ?? null)),
  };
}

/** A game-only row's kind, from what its file says it is. */
export function kindOfRound(round: Round): BombKind {
  switch (round.category) {
    case "bomb":
      if (round.incendiary) return "INC";
      if (round.drag) return "DRAG";
      return /\b(AP|SAP)\b|armou?r[- ]piercing/i.test(round.name ?? "") ? "AP" : "GP";
    case "guidedBomb":
      if (round.stats.aiming) return "RC";
      return KIND_OF_SEEKER[(round.stats.guidance ?? "").split("+")[0]] ?? "OTHER";
    case "rocket":
      return "ROCKET";
    case "agm":
      return "AGM";
    case "aam":
      return "AAM";
    case "torpedo":
      return "TORPEDO";
    case "mine":
      return "MINE";
    case "gun":
      return "GUN";
  }
}

/** A price-list country (`country_usa`) as one of the site's nations. */
export const nationOfCountry = (country: string | undefined): Nation | null => {
  const nation = country?.replace(/^country_/, "") as Nation | undefined;
  return nation && NATIONS.includes(nation) ? nation : null;
};

export type Reconciled = {
  rows: Bomb[];
  /** One round's full figures per row, for the weapon pages. */
  stats: Record<string, WeaponStats>;
  /** Every figure the game overruled, as "row: field sheet → game". */
  changes: string[];
  /** Sheet rows no file in the game ties to. */
  unmatched: string[];
  /** Sheet rows the game prices nowhere whose figure the explosion model does not reproduce. */
  estimates: string[];
};

/**
 * Lays the game's rounds over the sheet's rows, and adds a row for every
 * weapon the sheet has none for.
 */
export function reconcile(
  sheetRows: Bomb[],
  rounds: Round[],
  countryOf: (unit: string) => string | undefined,
): Reconciled {
  const byRow = new Map<string, Round[]>();
  for (const round of [...rounds].sort((a, b) => a.file.localeCompare(b.file))) {
    if (round.bombId) byRow.set(round.bombId, [...(byRow.get(round.bombId) ?? []), round]);
  }
  const representative = (members: Round[]) =>
    members.find((r) => r.damageSource === "game") ?? members[0];

  const stats: Record<string, WeaponStats> = {};
  const changes: string[] = [];
  const unmatched: string[] = [];
  const estimates: string[] = [];

  const rows = sheetRows.map((sheet) => {
    const members = byRow.get(sheet.id) ?? [];
    if (members.length === 0) {
      unmatched.push(sheet.chartName || sheet.fullName);
      return sheet.damageValue !== null ? { ...sheet, damageSource: "sheet" as const } : sheet;
    }
    stats[sheet.id] = representative(members).stats;
    const game = figuresOf(members);
    const next: Bomb = { ...sheet };

    // The game's own price first; then the sheet's, which for a weapon the
    // game prices only inside a fixed setup (the Pe-8's FAB-5000) is the
    // game's price too; the estimate only where neither says anything.
    if (game.damageSource === "game") {
      next.damageValue = game.damage;
      next.damageSource = "game";
    } else if (sheet.damageValue !== null) {
      next.damageSource = "sheet";
      if (game.damage !== null && Math.abs(game.damage - sheet.damageValue) > 1) {
        estimates.push(`${sheet.chartName || sheet.fullName}: sheet ${sheet.damageValue}, estimate ${game.damage}`);
      }
    } else if (game.damage !== null) {
      next.damageValue = game.damage;
      next.damageSource = "estimate";
    }
    if (game.massKg !== undefined) {
      next.massKg = round2(game.massKg);
      next.massLabel = massLabelOf(game.massKg, game.massLbs);
    }
    if (game.tntKg !== undefined && game.tntKg !== null) next.tntKg = round2(game.tntKg);
    if (game.guidance) {
      next.guidance = game.guidance;
      if (GUIDED.has(sheet.kind)) next.kind = KIND_OF_SEEKER[game.guidance.split("+")[0]] ?? sheet.kind;
    }
    if (next.damageValue !== sheet.damageValue || next.massKg !== sheet.massKg) {
      next.efficiency =
        next.damageValue !== null && next.massKg ? Math.round(next.damageValue / next.massKg) : sheet.efficiency;
    }

    const overruled: SheetFigures = {};
    for (const key of OVERRULED) {
      if (next[key] === sheet[key]) continue;
      (overruled as Record<string, unknown>)[key] = sheet[key];
      if (key !== "efficiency") changes.push(`${sheet.chartName || sheet.fullName}: ${key} ${sheet[key]} → ${next[key]}`);
    }
    if (Object.keys(overruled).length > 0) next.sheet = overruled;
    return next;
  });

  const sheetIds = new Set(sheetRows.map((row) => row.id));
  for (const [id, members] of byRow) {
    if (sheetIds.has(id)) continue;
    const first = representative(members);
    stats[id] = first.stats;
    const game = figuresOf(members);
    const countries = new Map<Nation, number>();
    for (const unit of members.flatMap((r) => r.units)) {
      const nation = nationOfCountry(countryOf(unit));
      if (nation) countries.set(nation, (countries.get(nation) ?? 0) + 1);
    }
    const nation = [...countries].sort((a, b) => b[1] - a[1] || NATIONS.indexOf(a[0]) - NATIONS.indexOf(b[0]))[0]?.[0] ?? null;
    const massKg = game.massKg ?? first.stats.massKg ?? null;
    rows.push({
      id,
      chartName: first.short ?? first.name ?? first.file,
      fullName: first.name ?? first.short ?? first.file,
      kind: kindOfRound(first),
      ...(game.guidance ? { guidance: game.guidance } : {}),
      source: "game",
      nation,
      massKg: massKg === null ? null : round2(massKg),
      massLabel: massKg === null ? "" : massLabelOf(massKg, game.massLbs),
      tntKg: game.tntKg === undefined || game.tntKg === null ? null : round2(game.tntKg),
      damageValue: game.damage,
      ...(game.damageSource ? { damageSource: game.damageSource } : {}),
      efficiency: game.damage !== null && massKg ? Math.round(game.damage / massKg) : null,
      sheetCounts: null,
      usedByNations: [],
    });
  }
  return { rows, stats, changes, unmatched, estimates };
}
