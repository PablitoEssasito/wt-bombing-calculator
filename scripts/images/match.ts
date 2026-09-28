/**
 * Lines the spreadsheet's aircraft names up with the War Thunder wiki's.
 *
 * The wiki names a vehicle more formally than the sheet does — "Lancaster B Mk I"
 * against "Lancaster I", "B6N1 Model 11" against "B6N1 Mod. 11" — so matching
 * runs through progressively looser rules, each of which must land on exactly one
 * candidate before it is accepted.
 */

/** The wiki's own aircraft classes — the same three the game itself sorts by. */
export const VEHICLE_TYPES = ["fighter", "bomber", "assault"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export type WikiUnit = {
  id: string;
  name: string;
  country: string;
  /**
   * How the wiki marks the vehicle: 0 for tech-tree research, 1 for premium
   * (bought outright), 2 for a squadron vehicle (earned through a squadron's
   * own activity). The same three the game's own tech tree colours gold and
   * green for.
   */
  rewardKind: 0 | 1 | 2;
  /** Null for the handful of rows whose class the wiki itself leaves unset. */
  vehicleType: VehicleType | null;
  /** Air RB battle rating, off the wiki's economic rank; null where it gives none. */
  br: number | null;
};

export type SheetAircraft = {
  id: string;
  name: string;
  nation: string;
  /** The sheet's section: "premium-…" for a bought aircraft, "tt-…" for one researched — squadron vehicles among them. */
  category?: string;
  /**
   * The battle rating aircraft.json holds when this runs: the sheet's, as
   * `npm run data` runs etl just before; after battle-ratings, the last matched
   * unit's — so rerun etl first when rematching on its own.
   */
  br?: number;
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
 * one side or the other. The Tu-2S pair is a rename on the game's side: Sky
 * Odyssey (2.26) dropped the year suffixes for regiment numbers, and the sheet
 * kept the old names.
 */
export const NAME_ALIASES: Record<string, string> = {
  "Su-2 TTS-1": "Su-2 TSS-1",
  "Mirage 2K-5F": "Mirage 2000-5F",
  "Mirage 2K-R1": "Mirage 2000D-R1",
  "Mirage 2K-RMV": "Mirage 2000D-RMV",
  "Tu-2S-44": "Tu-2S (1)",
  "Tu-2S-59": "Tu-2S (8)",
  "Tornado IDS'95": "Tornado IDS (1995)",
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

/** Every unit a name could plausibly mean, grouped by how firmly it says so. */
type Candidates = {
  exact: Prepared[];
  prefix: Prepared[];
  tokens: Prepared[];
  reverse: Prepared[];
  foreign: Prepared[];
};

function candidatesFor(
  plane: SheetAircraft,
  prepared: Prepared[],
  byNation: Map<string, Prepared[]>,
): Candidates {
  const name = NAME_ALIASES[plane.name] ?? plane.name;
  const key = normalize(name);
  const needed = tokenize(name);
  const pool = byNation.get(plane.nation) ?? [];

  const candidates: Candidates = {
    exact: pool.filter((u) => u.key === key),
    prefix: pool.filter((u) => key.length >= 3 && u.key.startsWith(key)),
    tokens: pool.filter((u) => covers(needed, u.tokens)),
    reverse: pool.filter((u) => u.key.length >= 4 && key.startsWith(u.key)),
    foreign: prepared.filter((u) => u.key === key),
  };
  // Where a name fits a premium and a researched unit alike, the sheet's section
  // decides: its premium "Vautour IIA IDF" is the Vautour IIA IDF/AF, and its
  // researched "Vautour IIA" the S.O.4050, not the premium the prefix rule
  // lands on first. The sheet files squadron vehicles with the researched.
  // Within the row's own nation only: another nation's premium of the same
  // name says nothing about which of this one's units the row means.
  if (plane.category === undefined) return candidates;
  const premium = plane.category.startsWith("premium");
  const fits = (u: Prepared) => (u.rewardKind === 1) === premium;
  const own = [candidates.exact, candidates.prefix, candidates.tokens, candidates.reverse];
  if (!own.some((list) => list.some(fits))) return candidates;
  return {
    exact: candidates.exact.filter(fits),
    prefix: candidates.prefix.filter(fits),
    tokens: candidates.tokens.filter(fits),
    reverse: candidates.reverse.filter(fits),
    foreign: candidates.foreign,
  };
}

/**
 * The row's name exactly, among units no other row has claimed — two of them
 * told apart by the sheet's battle rating, whichever row comes first: France's
 * "F-16A" at 12.7 is the Belgian one, at 12.3 the Dutch.
 */
function exactMatch(c: Candidates, taken: ReadonlySet<string>, br: number | undefined): Match | null {
  const free = c.exact.filter((u) => !taken.has(u.id));
  const unit = free.find((u) => br !== undefined && u.br === br) ?? free[0];
  return unit ? { unit, method: "exact" } : null;
}

/** A looser rule that landed on exactly one candidate, which is as sure as this gets. */
function confidentMatch(c: Candidates): Match | null {
  if (c.prefix.length === 1) return { unit: c.prefix[0], method: "prefix" };
  if (c.tokens.length === 1) return { unit: c.tokens[0], method: "tokens" };
  // A shorter wiki name only when nothing longer fits: "Yer-2 (M-105R)" is one
  // of the two M-105R units, not the M-105 its name happens to start with.
  if (c.reverse.length === 1 && c.prefix.length === 0 && c.tokens.length === 0) {
    return { unit: c.reverse[0], method: "reverse" };
  }
  return null;
}

/**
 * The best of several candidates, once the confident matches have had their say.
 *
 * `taken` is what those matches claimed, and skipping it is what stops a guess
 * from walking off with a unit another row named outright. The sheet lists
 * "F-4EJ" and "F-4EJ ADTW" separately; the ADTW row matches its unit exactly,
 * while the plain row matches nothing exactly and used to be handed that same
 * ADTW — the shortest of the three F-4EJ names — leaving the tech-tree F-4EJ
 * unused and two rows sharing one aircraft's hardpoints. Same story for
 * Germany's Tornado IDS, which reached across to Italy's.
 */
function fallbackMatch(c: Candidates, taken: ReadonlySet<string>, br: number | undefined): Match | null {
  const free = (list: Prepared[]) => list.filter((u) => !taken.has(u.id));

  // Not for a row its own nation has the name for, every such unit taken: it
  // shares one of those rather than take another nation's aircraft's pylons.
  if (c.exact.length === 0) {
    const foreign = free(c.foreign);
    if (foreign.length > 0) return { unit: foreign[0], method: "cross-nation" };
  }

  // Several fit. The shortest name is the plain variant the sheet means when
  // it does not say otherwise.
  const spare = free([...c.tokens, ...c.prefix]);
  // Nothing left unclaimed: better a picture shared with another row than none,
  // which is the case for France's two F-16AM rows and the game's one F-16AM.
  const pool = spare.length > 0 ? spare : c.exact.length > 0 ? c.exact : [...c.tokens, ...c.prefix];
  // The sheet's battle rating tells two such units apart: its "Sea Harrier FRS"
  // at 10.7 is the FRS.1 (e), the one at 11.0 the squadron's FRS.1.
  const atBr = pool.filter((u) => br !== undefined && u.br === br);
  const fallback = [...(atBr.length > 0 ? atBr : pool)].sort((a, b) => a.key.length - b.key.length)[0];
  return fallback ? { unit: fallback, method: "ambiguous" } : null;
}

/**
 * Lines every aircraft up with its wiki unit, confident rules first.
 *
 * The two passes matter because this map long ago stopped being only about
 * pictures: `armamentFor` reads it to decide whose hardpoints the loadout
 * creator offers, so a guess landing on the wrong variant is no longer a
 * slightly-off render but the wrong aircraft's pylons.
 */
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

  const candidates = new Map(
    aircraft.map((plane) => [plane.id, candidatesFor(plane, prepared, byNation)]),
  );

  const matches = new Map<string, Match>();
  const claimed = new Set<string>();
  const claim = (plane: SheetAircraft, match: Match) => {
    matches.set(plane.id, match);
    claimed.add(match.unit.id);
  };

  // Exact names first, so a looser rule on an earlier row cannot take a unit a
  // later row names outright; a second row of one name gets the other unit of
  // that name, not the first row's again.
  for (const plane of aircraft) {
    const match = exactMatch(candidates.get(plane.id)!, claimed, plane.br);
    if (match) claim(plane, match);
  }
  for (const plane of aircraft) {
    const c = candidates.get(plane.id)!;
    if (matches.has(plane.id) || c.exact.length > 0) continue;
    const match = confidentMatch(c);
    if (match && !claimed.has(match.unit.id)) claim(plane, match);
  }

  const unmatched: SheetAircraft[] = [];
  for (const plane of aircraft.filter((p) => !matches.has(p.id))) {
    const match = fallbackMatch(candidates.get(plane.id)!, claimed, plane.br);
    if (!match) {
      unmatched.push(plane);
      continue;
    }
    // Claimed too, so the two "Sea Harrier FRS" rows take a unit each.
    claim(plane, match);
  }

  return { matches, unmatched };
}

const isVehicleType = (value: unknown): value is VehicleType =>
  typeof value === "string" && (VEHICLE_TYPES as readonly string[]).includes(value);

/** Pulls the wiki's own unit table out of its aviation page. */
export function parseUnitList(html: string): WikiUnit[] {
  const raw = html.match(/window\.WT_UnitList\s*=\s*'([\s\S]*?)';/)?.[1];
  if (!raw) throw new Error("WT_UnitList not found — the wiki page changed shape");

  // Each row carries several fields this project has no use for — battle ratings
  // per mode, the research-tree position, a price block — so it's read by
  // position rather than typed as a whole. Index 5 is the reward kind; index 7
  // is [[classSlug, classLabel, classColor], ...], the same class the wiki's
  // own filter buttons and the game's tech tree group aircraft by.
  const rows = JSON.parse(raw.replace(/\\'/g, "'")) as unknown[][];
  return rows.map((row) => {
    const [id, name, country] = row as [string, string, string];
    const rewardKind = row[5];
    // Index 4 is the economic rank per mode; a battle rating is rank / 3 + 1.
    const rb = (row[4] as { rb?: unknown } | undefined)?.rb;
    const classSlug = (row[7] as [[string, string, string]] | undefined)?.[0]?.[0];
    return {
      id,
      name,
      country,
      rewardKind: (typeof rewardKind === "number" ? rewardKind : 0) as 0 | 1 | 2,
      vehicleType: isVehicleType(classSlug) ? classSlug : null,
      br: typeof rb === "number" ? Math.round((rb / 3 + 1) * 10) / 10 : null,
    };
  });
}
