import { BASE_HP_TIERS, type Nation } from "../../src/domain/constants";
import type { Bomb, BombKind } from "../../src/domain/types";
import { normalizeBombName, slugifyBomb, unpricedBombs } from "./aliases";
import { BOMB_CHART_NATION_ORDER, BOMB_COL } from "./config";
import { cell, flatten, parseCsv } from "./csv";

const LB_TO_KG = 0.45359237;

const KINDS: Record<string, BombKind> = {
  GP: "GP",
  AP: "AP",
  DRAG: "DRAG",
  INC: "INC",
  MINE: "MINE",
  GNSS: "GNSS",
  LAS: "LAS",
  TV: "TV",
  IR: "IR",
  RC: "RC",
};

/** "LAS-M" and friends mark guided missiles; the guidance type is what matters here. */
function toKind(raw: string): BombKind {
  return KINDS[raw.replace(/-M$/, "").toUpperCase()] ?? "OTHER";
}

function parseMass(raw: string): { kg: number | null; label: string } {
  const label = flatten(raw);
  const match = label.match(/^([\d.]+)\s*(kg|lb|lbs)$/i);
  if (!match) return { kg: null, label };
  const value = Number(match[1]);
  return { kg: match[2].toLowerCase().startsWith("lb") ? value * LB_TO_KG : value, label };
}

function parseNumber(raw: string): number | null {
  const text = flatten(raw).replace(/,/g, "");
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A bomb plus the nation block of the chart it was listed under. */
type ChartRow = { bomb: Bomb; nation: Nation | null };

/**
 * Chart names looked up two ways.
 *
 * The exact spelling is tried first because it is sometimes the only thing
 * separating two bombs: Britain's "G.P.500" and Italy's "GP 500" are different
 * weapons that differ only in punctuation. The normalised map then absorbs the
 * genuine typos ("Mk82" for "Mk 82", "BLU1" for "BLU-1").
 */
type NameIndex = { exact: Map<string, string>; normalized: Map<string, string> };

export type BombIndex = {
  bombs: Bomb[];
  byNation: Map<Nation, NameIndex>;
  /** Names that mean the same bomb whichever nation is asking. */
  global: NameIndex;
  /** Names several nations define differently; only resolvable in context. */
  ambiguous: Map<string, string[]>;
  nationBlocks: number;
};

function emptyIndex(): NameIndex {
  return { exact: new Map(), normalized: new Map() };
}

function addFirst(map: Map<string, string>, key: string, id: string) {
  if (key && !map.has(key)) map.set(key, id);
}

export function parseBombs(csvText: string): BombIndex {
  const rows = parseCsv(csvText);
  const chartRows: ChartRow[] = [];
  const usedIds = new Set<string>();

  let nationIndex = 0;
  let previousDamage = -Infinity;

  for (const row of rows) {
    const chartName = flatten(cell(row, BOMB_COL.chartName));
    const fullName = flatten(cell(row, BOMB_COL.fullName));
    const damageValue = parseNumber(cell(row, BOMB_COL.damage));

    // Header and spacer rows carry no name; a row with no damage is not a bomb.
    if (!fullName || damageValue === null) continue;
    if (chartName === "Chart Name") continue;

    // Damage climbs through a nation's block and drops at the next one.
    if (damageValue < previousDamage) nationIndex++;
    previousDamage = damageValue;

    const counts = BASE_HP_TIERS.map((_, i) => parseNumber(cell(row, BOMB_COL.countsStart + i)));
    const mass = parseMass(cell(row, BOMB_COL.mass));

    const base = slugifyBomb(chartName || fullName);
    let id = base;
    // Variants such as the Snake Eye share a chart name with their parent row.
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);

    const nation = BOMB_CHART_NATION_ORDER[nationIndex] ?? null;
    chartRows.push({
      nation,
      bomb: {
        id,
        chartName,
        fullName,
        kind: toKind(flatten(cell(row, BOMB_COL.kind))),
        nation,
        massKg: mass.kg,
        massLabel: mass.label,
        tntKg: parseMass(cell(row, BOMB_COL.tnt)).kg,
        damageValue,
        efficiency: parseNumber(cell(row, BOMB_COL.efficiency)),
        sheetCounts: counts.every((c) => c !== null) ? (counts as number[]) : null,
      },
    });
  }

  const bombs = chartRows.map((r) => r.bomb);
  const damageById = new Map(bombs.map((b) => [b.id, b.damageValue]));

  const byNation = new Map<Nation, NameIndex>();
  const exactCandidates = new Map<string, string[]>();
  const normCandidates = new Map<string, string[]>();

  for (const { bomb, nation } of chartRows) {
    if (!bomb.chartName) continue;
    const key = normalizeBombName(bomb.chartName);

    if (nation) {
      const index = byNation.get(nation) ?? emptyIndex();
      addFirst(index.exact, bomb.chartName, bomb.id);
      addFirst(index.normalized, key, bomb.id);
      byNation.set(nation, index);
    }
    exactCandidates.set(bomb.chartName, [...(exactCandidates.get(bomb.chartName) ?? []), bomb.id]);
    normCandidates.set(key, [...(normCandidates.get(key) ?? []), bomb.id]);
  }

  // Several rows may share a name harmlessly as long as they hit equally hard.
  const unambiguous = (ids: string[]) => new Set(ids.map((id) => damageById.get(id))).size === 1;

  const global = emptyIndex();
  for (const [name, ids] of exactCandidates) {
    if (unambiguous(ids)) global.exact.set(name, ids[0]);
  }
  const ambiguous = new Map<string, string[]>();
  for (const [key, ids] of normCandidates) {
    if (unambiguous(ids)) global.normalized.set(key, ids[0]);
    else ambiguous.set(key, ids);
  }

  for (const bomb of unpricedBombs()) {
    bombs.push(bomb);
    global.exact.set(bomb.chartName, bomb.id);
    global.normalized.set(normalizeBombName(bomb.chartName), bomb.id);
  }

  return { bombs, byNation, global, ambiguous, nationBlocks: nationIndex + 1 };
}
