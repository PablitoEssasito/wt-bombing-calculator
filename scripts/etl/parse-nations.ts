import { baseHpForBr } from "../../src/domain/base-hp";
import type { Nation, VehicleCategory } from "../../src/domain/constants";
import type {
  Aircraft,
  BaseLoadout,
  BrBracket,
  LoadoutItem,
  LoadoutOption,
  Schedule,
} from "../../src/domain/types";
import {
  AIRCRAFT_NAME_CORRECTIONS,
  AMBIGUOUS_DEFAULT_NATION,
  BOMB_ALIASES,
  BOMB_ID_ALIASES,
  normalizeBombName,
} from "./aliases";
import { NATION_COL } from "./config";
import { cell, flatten, parseCsv } from "./csv";
import { noteKey, type NoteGrid } from "./notes";
import type { BombIndex } from "./parse-bombs";

const ROMAN: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};

const CATEGORIES: Record<string, VehicleCategory> = {
  X: "tt-bomber",
  F: "tt-fighter",
  P: "premium-bomber",
  PF: "premium-fighter",
};

export type UnresolvedName = {
  nation: Nation;
  aircraft: string;
  name: string;
  /** Set when the name exists but several nations define it differently. */
  candidates?: string[];
};

export type NationParseResult = {
  aircraft: Aircraft[];
  /** The source's commentary on the nation as a whole, if it has any. */
  nationNote: string | null;
  unresolved: UnresolvedName[];
  /** Schedule rows that continued an option without one ever being opened. */
  orphanRows: string[];
};

/**
 * Splits a heading cell into its name and battle rating. The BR is always the
 * trailing number, but whether it sits on its own line varies by row.
 */
function parseNameAndBr(raw: string): { name: string; br: number } | null {
  const text = flatten(raw);
  const match = text.match(/^(.*?)\s+(\d+\.\d+)$/);
  if (!match || !match[1]) return null;
  const name = match[1].trim();
  return { name: AIRCRAFT_NAME_CORRECTIONS[name] ?? name, br: Number(match[2]) };
}

/**
 * Reads an up/down bracket marker.
 *
 * An up arrow with 2.0 means the row it sits on covers matches up to BR 2.0; a
 * 2.3 with a down arrow means the row covers matches from BR 2.3 upwards.
 */
function parseBracket(raw: string): BrBracket | null {
  const text = flatten(raw);
  const br = text.match(/(\d+\.\d+)/);
  if (!br) return null;
  if (text.includes("▲")) return { kind: "max", br: Number(br[1]) };
  if (text.includes("▼")) return { kind: "min", br: Number(br[1]) };
  return null;
}

function parseTrailingNumber(raw: string): number | null {
  const match = flatten(raw).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/**
 * Rewrites the two count separators the source uses into one.
 *
 * Most cells use a multiplication sign, but a handful use a bare "x" and
 * sometimes drop the spaces with it, as in "SC50x5" or "M30A1x6 M57x2".
 * Normalising first lets a single pattern pull every entry out, including cells
 * that list several bomb types.
 */
function normalizeSeparators(text: string): string {
  return text
    .replace(/\s*[×✕✖]\s*(\d+)/g, " × $1")
    .replace(/\s*x\s*(\d+)\b/g, " × $1");
}

type ParsedCell = { items: { name: string; count: number }[] };

/**
 * Past ten bases the sheet runs out of columns and writes the rest as a bare
 * "+ 2" — a base count with no load beside it. That has no × in it, so the
 * item regex below already finds nothing there; `schedule.ts` recovers the
 * count itself, from the gap between what the row states destroyed and how
 * many base cells it actually filled in (see `unlistedBases`), rather than
 * this cell needing to be read specially.
 */
function parseBaseCell(raw: string): ParsedCell {
  const text = normalizeSeparators(flatten(raw));

  const items: { name: string; count: number }[] = [];
  for (const match of text.matchAll(/([^×]+?)\s*×\s*(\d+)/g)) {
    const name = match[1].trim();
    if (name) items.push({ name, count: Number(match[2]) });
  }
  return { items };
}

function parseNoteMarker(raw: string): LoadoutOption["noteMarker"] {
  const text = flatten(raw);
  if (text.includes("★")) return "star";
  if (text.includes("!")) return "!";
  if (text.includes("?")) return "?";
  return null;
}

/**
 * Whether the note tells the reader not to take this loadout.
 *
 * The markers cannot answer this. A star is always an endorsement, but "!" is a
 * general read-this-first flag that covers plain tradeoffs — "leaves you with
 * zero weaponry", "your maximum release speed will be Mach 1" — as often as it
 * covers a refusal, and one outright refusal is filed under "?" instead. So the
 * sentence has to be read.
 *
 * Both patterns are deliberately narrow, because the author uses the same verb
 * for the opposite meaning nearby: "I don't recommend trying that" rejects an
 * alternative described inside the note rather than the loadout shown, and "I do
 * recommend taking them" argues for gun pods. Matching on the loadout being the
 * object of the refusal keeps those out.
 */
const ARGUES_AGAINST = [
  /\b(?:would\s?n[o']?t|would not|do\s?n[o']?t|do not)\s+recommend\s+(?:using\s+)?th(?:is|e)\s+(?:loadout|plane)/i,
  /\brecommend\s+(?:using\s+)?the\s+(?:loadout|options?)\s+below/i,
];

function readsAsDiscouraged(note: string | null): boolean {
  return note !== null && ARGUES_AGAINST.some((pattern) => pattern.test(note));
}

/**
 * What a note says that has no bearing on the loadout: credits, the star's own
 * "Recommended loadout.", a multiplier the page already shows (and the sheet's
 * column has since revised in places), news and asides. Cut before display;
 * whether the note argues against the loadout is still read from all of it.
 */
const NOISE: [RegExp, string][] = [
  [/^Recommended loadout\.?[ \t]*$/gm, ""],
  [/^Reward multiplier for bases: [\d.]+[ \t]*$/gm, ""],
  [/[ \t]*Thanks to [^\n]*?\b(?:loadout|bombs|option)\.(?=\s|$)/g, ""],
  [/^"What is this goofy loadout\?"\s*/, ""],
  [/ They are also quite funny against tanks in ground battles\./, ""],
  [/, but I've seen people prank other jets with them\./, "."],
  [/^The Yak-28B has received a new version of the 3000 kg bomb and is now finally able to destroy a base\.$/, ""],
];

/**
 * The note and marker as the page shows them. A caveat with nothing left to say
 * goes altogether; a star or a warning keeps its heading, with an empty note
 * rather than null so the page doesn't take it for one the import couldn't read.
 */
export function shownNote(
  note: string | null,
  marker: LoadoutOption["noteMarker"],
): Pick<LoadoutOption, "note" | "noteMarker"> {
  if (note === null) return { note, noteMarker: marker };
  let text = note;
  for (const [pattern, replacement] of NOISE) text = text.replace(pattern, replacement);
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (text === "" && (marker === "?" || marker === null)) return { note: null, noteMarker: null };
  return { note: text, noteMarker: marker };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseNation(
  csvText: string,
  nation: Nation,
  bombs: BombIndex,
  notes: NoteGrid | null = null,
): NationParseResult {
  const rows = parseCsv(csvText);
  const noteAt = (row: number, column: number) => notes?.get(noteKey(row, column)) ?? null;
  const aircraft: Aircraft[] = [];
  const unresolved: UnresolvedName[] = [];
  const orphanRows: string[] = [];
  const usedIds = new Set<string>();

  let rank: number | null = null;
  let current: Aircraft | null = null;
  let currentOption: LoadoutOption | null = null;

  /**
   * Resolves a loadout entry against the bomb chart, preferring the nation's own
   * block.
   *
   * Nations reuse each other's names for different bombs. Britain's G.P.500 and
   * Italy's GP 500 collapse to the same key once punctuation is stripped, and the
   * American and British Mk 77 differ in damage, so a name is read in its own
   * nation's block first, and by exact spelling before normalised. Falling back
   * to the shared index then covers the common case of, say, Israeli aircraft
   * carrying American bombs.
   */
  const resolve = (name: string, owner: string): string | null => {
    const pinned = BOMB_ID_ALIASES[name];
    if (pinned && bombs.bombs.some((b) => b.id === pinned)) return pinned;
    const spelling = BOMB_ALIASES[name] ?? name;
    const key = normalizeBombName(spelling);
    const own = bombs.byNation.get(nation);
    const fallbackNation = AMBIGUOUS_DEFAULT_NATION[spelling];
    const preferred = fallbackNation ? bombs.byNation.get(fallbackNation) : undefined;

    const id =
      own?.exact.get(spelling) ??
      own?.normalized.get(key) ??
      bombs.global.exact.get(spelling) ??
      bombs.global.normalized.get(key) ??
      preferred?.exact.get(spelling) ??
      preferred?.normalized.get(key);

    if (!id) {
      unresolved.push({ nation, aircraft: owner, name, candidates: bombs.ambiguous.get(key) });
      return null;
    }
    return id;
  };

  for (const [rowIndex, row] of rows.entries()) {
    const rankMatch = cell(row, NATION_COL.rank).match(/^([IVX]+)\s+rank$/);
    if (rankMatch) {
      rank = ROMAN[rankMatch[1]] ?? null;
      continue;
    }
    // Everything above the first rank heading is the nation banner.
    if (rank === null) continue;
    // The column headings repeat above every rank.
    if (cell(row, NATION_COL.basesStart).startsWith("BASE")) continue;

    const heading = parseNameAndBr(cell(row, NATION_COL.nameAndBr));
    const owner = heading?.name ?? current?.name ?? "(unknown)";

    const bases: BaseLoadout[] = [];
    for (let col = NATION_COL.basesStart; col < NATION_COL.basesEnd; col++) {
      const parsed = parseBaseCell(cell(row, col));
      if (parsed.items.length === 0) continue;

      const items: LoadoutItem[] = [];
      for (const item of parsed.items) {
        const bombId = resolve(item.name, owner);
        if (bombId) items.push({ bombId, count: item.count });
      }
      if (items.length > 0) bases.push({ items });
    }

    if (heading) {
      const base = `${nation}-${slugify(heading.name)}`;
      let id = base;
      for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
      usedIds.add(id);

      current = {
        id,
        name: heading.name,
        nation,
        rank: rank ?? 0,
        br: heading.br,
        category: CATEGORIES[cell(row, NATION_COL.category)] ?? "tt-bomber",
        options: [],
      };
      aircraft.push(current);
      currentOption = null;
    }

    if (bases.length === 0) continue;

    const bracket = parseBracket(cell(row, NATION_COL.bracket));
    const schedule: Schedule = {
      bracket,
      baseHp: baseHpForBr(bracket ? bracket.br : (current?.br ?? 0)),
      bases,
      basesDestroyed: parseTrailingNumber(cell(row, NATION_COL.basesDestroyed)),
      bracketNote: noteAt(rowIndex, NATION_COL.bracket),
    };

    /**
     * A reward multiplier or a target count of its own marks the start of a new
     * way to arm the aircraft. A row with neither, carrying only a down-arrow
     * bracket, is the loadout above it flown in a higher-BR match, where the
     * tougher bases mean it flattens fewer of them.
     *
     * Both markers are needed: the B-52H has a loadout the sheet gives a target
     * count but no multiplier, and treating that as a continuation would fold two
     * different bomb loads into one.
     */
    const multiplier = parseTrailingNumber(cell(row, NATION_COL.rewardMultiplier));
    const opensLoadout = multiplier !== null || schedule.basesDestroyed !== null;
    if (opensLoadout || currentOption === null) {
      if (!current) {
        orphanRows.push(`${nation}: schedule row before any aircraft heading`);
        continue;
      }
      const note = noteAt(rowIndex, NATION_COL.noteMarker);
      currentOption = {
        rewardMultiplier: multiplier,
        ...shownNote(note, parseNoteMarker(cell(row, NATION_COL.noteMarker))),
        discouraged: readsAsDiscouraged(note),
        schedules: [schedule],
      };
      current.options.push(currentOption);
    } else {
      currentOption.schedules.push(schedule);
    }
  }

  /**
   * The nation's own commentary hangs off the marker beside the tab heading,
   * above every aircraft. There is at most one per tab, so the first note in that
   * column is it.
   */
  const nationNote =
    rows
      .map((_, rowIndex) => noteAt(rowIndex, NATION_COL.nationNote))
      .find((note) => note !== null) ?? null;

  return { aircraft, nationNote, unresolved, orphanRows };
}
