/**
 * Lines the spreadsheet's aircraft names up with the War Thunder wiki's.
 *
 * The wiki names a vehicle more formally than the sheet does — "Lancaster B Mk I"
 * against "Lancaster I", "B6N1 Model 11" against "B6N1 Mod. 11" — so matching
 * runs through progressively looser rules, each of which must land on exactly one
 * candidate before it is accepted.
 */

export type WikiUnit = {
  id: string;
  name: string;
  country: string;
};

export type SheetAircraft = {
  id: string;
  name: string;
  nation: string;
};

export type MatchMethod =
  | "exact"
  | "prefix"
  | "tokens"
  | "reverse"
  | "cross-nation"
  | "ambiguous";

export type Match = { unit: WikiUnit; method: MatchMethod };

/**
 * Names the sheet abbreviates past recognition, where no rule would get there.
 *
 * "2K" for "2000" is the sheet's own shorthand, and TTS/TSS is a plain typo on
 * one side or the other.
 */
export const NAME_ALIASES: Record<string, string> = {
  "Su-2 TTS-1": "Su-2 TSS-1",
  "Mirage 2K-5F": "Mirage 2000-5F",
  "Mirage 2K-R1": "Mirage 2000D-R1",
  "Mirage 2K-RMV": "Mirage 2000D-RMV",
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Words the wiki spells out and the sheet leaves implicit. */
const FILLER = new Set(["mk", "model", "mod", "serie", "series"]);

function tokenize(name: string): string[] {
  const out: string[] = [];
  for (const raw of name.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || FILLER.has(raw)) continue;
    out.push(raw);
    // So that the sheet's "Buccaneer 1" can reach the wiki's "Buccaneer S.1".
    const digits = raw.match(/^[a-z]+(\d+)$/)?.[1];
    if (digits) out.push(digits);
  }
  return out;
}

type Prepared = WikiUnit & { key: string; tokens: Set<string> };

function prepare(units: WikiUnit[]): Prepared[] {
  return units.map((unit) => ({
    ...unit,
    key: normalize(unit.name),
    tokens: new Set(tokenize(unit.name)),
  }));
}

/** Every token the sheet uses is met by an equal or longer wiki token. */
const covers = (needed: string[], have: Set<string>) =>
  needed.every((token) => [...have].some((h) => h === token || h.startsWith(token)));

export function matchAircraft(
  aircraft: SheetAircraft[],
  units: WikiUnit[],
): { matches: Map<string, Match>; unmatched: SheetAircraft[] } {
  const prepared = prepare(units);
  const byNation = new Map<string, Prepared[]>();
  for (const unit of prepared) {
    const list = byNation.get(unit.country) ?? [];
    list.push(unit);
    byNation.set(unit.country, list);
  }

  const matches = new Map<string, Match>();
  const unmatched: SheetAircraft[] = [];

  for (const plane of aircraft) {
    const name = NAME_ALIASES[plane.name] ?? plane.name;
    const key = normalize(name);
    const needed = tokenize(name);
    const pool = byNation.get(plane.nation) ?? [];

    const exact = pool.filter((u) => u.key === key);
    const prefix = pool.filter((u) => key.length >= 3 && u.key.startsWith(key));
    const tokens = pool.filter((u) => covers(needed, u.tokens));
    const reverse = pool.filter((u) => u.key.length >= 4 && key.startsWith(u.key));
    const foreign = prepared.filter((u) => u.key === key);

    let match: Match | null = null;
    if (exact.length > 0) match = { unit: exact[0], method: "exact" };
    else if (prefix.length === 1) match = { unit: prefix[0], method: "prefix" };
    else if (tokens.length === 1) match = { unit: tokens[0], method: "tokens" };
    else if (reverse.length === 1) match = { unit: reverse[0], method: "reverse" };
    else if (foreign.length > 0) match = { unit: foreign[0], method: "cross-nation" };
    else {
      // Several fit. The shortest name is the plain variant the sheet means when
      // it does not say otherwise.
      const fallback = [...tokens, ...prefix].sort((a, b) => a.key.length - b.key.length)[0];
      if (fallback) match = { unit: fallback, method: "ambiguous" };
    }

    if (match) matches.set(plane.id, match);
    else unmatched.push(plane);
  }

  return { matches, unmatched };
}

/** Pulls the wiki's own unit table out of its aviation page. */
export function parseUnitList(html: string): WikiUnit[] {
  const raw = html.match(/window\.WT_UnitList\s*=\s*'([\s\S]*?)';/)?.[1];
  if (!raw) throw new Error("WT_UnitList not found — the wiki page changed shape");

  const rows = JSON.parse(raw.replace(/\\'/g, "'")) as [string, string, string][];
  return rows.map(([id, name, country]) => ({ id, name, country }));
}
