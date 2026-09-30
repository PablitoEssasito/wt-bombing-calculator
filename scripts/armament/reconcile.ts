import { NATIONS, type Nation } from "../../src/domain/constants";
import type { Bomb, BombKind, WeaponStats } from "../../src/domain/types";
import { categoryOfKind, categoryOfRound, tagsOf, tagsOfKind, type WeaponTag } from "../../src/domain/weapon-tags";
import type { Round } from "./stores";

/**
 * The armament table's rows, from the game's files.
 *
 * A sheet row keeps its name, its place in the loadouts and its id, but every
 * figure — damage to a base, mass, TNT, guidance — comes from the game: its
 * own price, else an estimate from its explosion model, never the sheet's.
 * What the sheet printed is kept beside it (`Bomb.sheet`), for the import's
 * report and to start a rerun from. Every weapon the sheet has no row for gets
 * a row of the game's own.
 */

type SheetFigures = NonNullable<Bomb["sheet"]>;
const OVERRULED = ["kind", "massKg", "massLabel", "tntKg", "damageValue", "efficiency"] as const satisfies readonly (keyof SheetFigures)[];

export { sheetView } from "../../src/domain/bomb-chart";

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

/** The most common of a list of values, the lower one on a tie. */
export function mostCommon(values: number[]): number {
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

/**
 * A row's tags: what most of its files earn — O-100 is two plain OFAB-100s and
 * a Czech high-drag one. On a tie, the tags its kind agrees with: the sheet's
 * 500M-62 is the plain bomb, not the glide kit priced alike.
 */
function tagsOfRow(members: Round[], kind: BombKind): WeaponTag[] {
  const counts = new Map<string, { tags: WeaponTag[]; n: number }>();
  for (const member of members) {
    const tags = tagsOf(member);
    const entry = counts.get(tags.join(",")) ?? { tags, n: 0 };
    entry.n++;
    counts.set(tags.join(","), entry);
  }
  const most = Math.max(...[...counts.values()].map((entry) => entry.n));
  const tied = [...counts.values()].filter((entry) => entry.n === most);
  const hint = tagsOfKind(kind);
  return (tied.find((entry) => hint.length > 0 && hint.every((tag) => entry.tags.includes(tag))) ?? tied[0]).tags;
}

/** A game-only row's kind, from what its file says it is. */
export function kindOfRound(round: Round): BombKind {
  switch (round.category) {
    case "bomb":
      if (round.incendiary) return "INC";
      if (round.drag) return "DRAG";
      return round.armourPiercing ? "AP" : "GP";
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
  /** Sheet rows with no file of their own that take a same-named weapon's figures. */
  aliased: string[];
  /** Sheet bombs whose file makes them another type than the sheet's kind: "row: sheet GP, game sap". */
  types: string[];
};

/** The bomb type a sheet kind names, to hold against the tag the game's file earns. */
const TYPE_OF_KIND: Partial<Record<BombKind, WeaponTag>> = { GP: "gp", AP: "ap", DRAG: "drag", INC: "incendiary" };

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
  const aliased: string[] = [];
  const types: string[] = [];

  /** Keeps what the sheet printed for each figure the game overruled, and reports it. */
  const withSheet = (sheet: Bomb, next: Bomb): Bomb => {
    const overruled: SheetFigures = {};
    for (const key of OVERRULED) {
      if (next[key] === sheet[key]) continue;
      (overruled as Record<string, unknown>)[key] = sheet[key];
      if (key !== "efficiency") changes.push(`${sheet.chartName || sheet.fullName}: ${key} ${sheet[key]} → ${next[key]}`);
    }
    if (Object.keys(overruled).length > 0) next.sheet = overruled;
    return next;
  };

  const tied = sheetRows.map((sheet): Bomb | null => {
    const members = byRow.get(sheet.id) ?? [];
    if (members.length === 0) return null;
    stats[sheet.id] = representative(members).stats;
    const game = figuresOf(members);
    const next: Bomb = { ...sheet };

    // The game's own price — a store's, or a fixed setup's over its bombs —
    // else the estimate from its explosion model. Never the sheet's.
    next.damageValue = game.damage;
    if (game.damageSource) next.damageSource = game.damageSource;
    else delete next.damageSource;
    if (game.damageSource === "estimate" && sheet.damageValue !== null && Math.abs(game.damage! - sheet.damageValue) > 1) {
      estimates.push(`${sheet.chartName || sheet.fullName}: sheet ${sheet.damageValue}, estimate ${game.damage}`);
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
        next.damageValue !== null && next.massKg ? Math.round(next.damageValue / next.massKg) : null;
    }
    next.category = categoryOfRound(representative(members).category);
    next.tags = tagsOfRow(members, sheet.kind);
    const sheetType = TYPE_OF_KIND[sheet.kind];
    if (sheetType && next.category === "bomb" && next.tags[0] !== sheetType) {
      types.push(`${sheet.chartName || sheet.fullName}: sheet ${sheet.kind}, game ${next.tags[0]}`);
    }
    return withSheet(sheet, next);
  });

  const sheetIds = new Set(sheetRows.map((row) => row.id));
  const gameRows: Bomb[] = [];
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
    // A gun's file weighs its round, not the pod: no mass beats 0.26 kg for a BK27 pod.
    const massKg = first.category === "gun" ? null : (game.massKg ?? first.stats.massKg ?? null);
    gameRows.push({
      id,
      chartName: first.short ?? first.name ?? first.file,
      fullName: first.name ?? first.short ?? first.file,
      kind: kindOfRound(first),
      ...(game.guidance ? { guidance: game.guidance } : {}),
      category: categoryOfRound(first.category),
      tags: tagsOfRow(members, kindOfRound(first)),
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

  // A sheet row no file ties to is a weapon the game has under the same name
  // (the sheet's "G.P.1000(l)" is the one 1000 lb G.P. Mk.I the Hampden hangs,
  // at the game's 2906 rather than the sheet's 5279), or nothing it has at all.
  const byName = new Map(
    [...tied.filter((row): row is Bomb => row !== null), ...gameRows].map((row) => [row.fullName.toLowerCase(), row]),
  );
  const rows = sheetRows.map((sheet, index) => {
    const row = tied[index];
    if (row) return row;
    unmatched.push(sheet.chartName || sheet.fullName);
    const twin = byName.get(sheet.fullName.toLowerCase());
    const next: Bomb = {
      ...sheet,
      damageValue: null,
      efficiency: null,
      category: categoryOfKind(sheet.kind),
      tags: tagsOfKind(sheet.kind),
    };
    delete next.damageSource;
    if (twin) {
      aliased.push(`${sheet.chartName || sheet.fullName} → ${twin.chartName || twin.fullName}`);
      Object.assign(next, {
        kind: twin.kind,
        massKg: twin.massKg,
        massLabel: twin.massLabel,
        tntKg: twin.tntKg,
        damageValue: twin.damageValue,
        efficiency: twin.efficiency,
        aliasOf: twin.id,
        category: twin.category,
        tags: twin.tags,
        ...(twin.damageSource ? { damageSource: twin.damageSource } : {}),
        ...(twin.guidance ? { guidance: twin.guidance } : {}),
      });
    }
    return withSheet(sheet, next);
  });
  return { rows: [...rows, ...gameRows], stats, changes, unmatched, estimates, aliased, types };
}
