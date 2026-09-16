/**
 * Lines the spreadsheet's bombs up with the game's own weapon definitions, to
 * find the UI icon War Thunder itself shows for each one.
 *
 * Names alone are too free-form to match safely — the sheet has "AN-M30A1", the
 * game's file is "bombguns/us_100lb_anm30.blkx" — so three signals are combined,
 * each narrowing the field before the next is applied:
 *
 * 1. Mass. The sheet's massKg and the game's own mass field trace back to the
 *    same source value and agree to a fraction of a kilogram, so this alone
 *    usually gets down to a handful of candidates.
 * 2. Kind. A GP bomb never gets a guided-bomb icon and a DRAG one always gets a
 *    high-drag icon — the game's own `bombType`/tags make this a hard filter,
 *    not a preference.
 * 3. Name. Only used to break a tie once the field is already this narrow, by
 *    checking whether one name's core letters sit inside the other's.
 */

export type WeaponDef = {
  /** Path under gamedata/weapons, e.g. "bombguns/us_100lb_anm30.blkx". */
  path: string;
  /** The UI icon key from the file's own `iconType` field, when it has one. */
  iconType: string | null;
  /** Mass in kilograms, however the file expressed it. */
  massKg: number | null;
  /** Set on mines, which carry no iconType of their own in the data. */
  isMine: boolean;
  /** Set on rockets — a different shape family entirely, despite overlapping masses. */
  isRocket: boolean;
  /** Set on guided/glide weapons, read from the file's own tags. */
  isGuided: boolean;
  /** Set when the file's own tags mark it a drag-retarded bomb. */
  isDrag: boolean;
  /** Set when the file's explosive type marks it incendiary (napalm, etc). */
  isIncendiary: boolean;
};

export type Bomb = {
  id: string;
  chartName: string;
  fullName: string;
  massKg: number | null;
  kind: string;
};

export type IconMatch = { iconType: string; confidence: "matched" | "fallback" };

/** Chart names the automatic pass cannot reach at all, matched by hand. */
export const ICON_ALIASES: Record<string, string> = {
  HVAR: "rocketguns/us_5_in_hvar.blkx",
  Zuni: "rocketguns/us_zuni_wafar_mk32.blkx",
  FFAR: "rocketguns/us_2_75_in_ffar_mighty_mouse.blkx",
  "RP-3": "rocketguns/uk_rp3.blkx",
  M8: "rocketguns/su_m8.blkx",
};

/** Country codes and unit words the game's filenames carry that the sheet's names never do. */
const FILE_NOISE = new Set([
  "us", "uk", "de", "germ", "su", "ussr", "rs", "ar", "cn", "ch", "jp", "it", "fr", "se", "il", "cz",
  "default", "early", "late",
]);

/** The letters that actually identify a weapon, once units and filler are stripped. */
function coreOf(raw: string, isFile: boolean): string {
  const base = isFile ? raw.replace(/^.*\//, "").replace(/\.blkx$/, "") : raw;
  const tokens = base
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !(isFile && FILE_NOISE.has(t)))
    // A bare weight token ("100lb", "250kg") or a bare number carries no identity
    // once mass has already matched; a compound token like "500sv" is kept whole.
    .filter((t) => !/^\d+(lb|lbs|kg|kgs)?$/.test(t));
  return tokens.join("");
}

/** How much one core string's identity overlaps the other's. */
function coreOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

/**
 * Mass tolerance for treating two records as the same weapon.
 *
 * Observed agreement is within grams for a light bomb and under a kilogram for a
 * 2 000 kg one, so 0.5% (floored at 0.3 kg) comfortably separates real matches
 * from coincidence without tripping over rounding.
 */
const massMatches = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.3, a * 0.005);

/** Whether an icon key belongs to the family a bomb's own kind calls for. */
function fitsKind(kind: string, def: WeaponDef): boolean {
  if (def.isMine) return kind === "MINE";
  if (def.isRocket) return kind === "ROCKET";
  switch (kind) {
    case "MINE":
    case "ROCKET":
      return false;
    case "GNSS":
    case "LAS":
    case "TV":
    case "IR":
    case "RC":
      return def.isGuided;
    case "DRAG":
      return def.isDrag && !def.isGuided;
    case "INC":
      return def.isIncendiary;
    case "GP":
    case "AP":
      return !def.isGuided && !def.isIncendiary;
    default:
      return true;
  }
}

/**
 * Picks the best same-mass candidate, or null when none of them are even the
 * right kind of weapon — a same-mass incendiary bomb is not a stand-in for a
 * general-purpose one, so that case is left for the size-bucket fallback rather
 * than accepted here.
 */
function pickBest(bomb: Bomb, candidates: WeaponDef[]): WeaponDef | null {
  const fitting = candidates.filter((d) => fitsKind(bomb.kind, d));
  if (fitting.length === 0) return null;

  const bombCore = coreOf(bomb.chartName || bomb.fullName, false);
  const ranked = fitting
    .map((def) => ({ def, score: coreOverlap(bombCore, coreOf(def.path, true)) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.def ?? null;
}

/**
 * The plain bomb-shape family: exactly small/middle/large/heavy/special, with no
 * drag, guidance or explosive-filling suffix. A handful of bombguns files carry
 * an odd iconType for what they mechanically are — a depth charge shaped like a
 * mine, still dropped like a bomb — and letting those into this table would
 * plant a wrong-shaped bucket at whatever mass they happen to share with a
 * perfectly ordinary bomb.
 */
const PLAIN_ICON = /^bombs_(small|middle|large|heavy|special)$/;

type MassBucket = { iconType: string; medianKg: number };

/**
 * The icon a bomb gets is not a clean function of mass — it also reads length
 * and calibre, so a long thin bomb can outweigh a short fat one three sizes up.
 * "bombs_small" and "bombs_middle" in the real data overlap across their entire
 * range rather than sitting on either side of a cutoff, so there is no boundary
 * to draw. Nearest-median classification sidesteps that: each family votes with
 * its typical mass, and an unmatched bomb goes to whichever family it sits
 * closest to, which is far steadier than picking the first cutoff it clears.
 */
function buildFallbackBuckets(defs: WeaponDef[]): MassBucket[] {
  const byIcon = new Map<string, number[]>();
  for (const d of defs) {
    if (
      d.path.startsWith("bombguns/") &&
      d.iconType &&
      PLAIN_ICON.test(d.iconType) &&
      d.massKg !== null
    ) {
      const list = byIcon.get(d.iconType) ?? [];
      list.push(d.massKg);
      byIcon.set(d.iconType, list);
    }
  }
  return [...byIcon].map(([iconType, masses]) => {
    const sorted = [...masses].sort((a, b) => a - b);
    return { iconType, medianKg: sorted[Math.floor(sorted.length / 2)] };
  });
}

function nearestBucket(massKg: number, table: MassBucket[]): MassBucket | null {
  return table.reduce<MassBucket | null>(
    (best, b) =>
      best === null || Math.abs(massKg - b.medianKg) < Math.abs(massKg - best.medianKg) ? b : best,
    null,
  );
}

/**
 * Incendiary bombs carry no iconType of their own anywhere in the data, so there
 * is nothing to learn buckets from directly. The game's small/middle/large/heavy
 * naming describes the casing size, which scales the same way regardless of
 * filling, so the plain-bomb buckets are reused with "bombs" swapped for
 * "napalm" — the equivalent key the icon atlas actually has for each size.
 */
function buildIncendiaryBuckets(plainBuckets: MassBucket[]): MassBucket[] {
  return plainBuckets
    .map(({ medianKg, iconType }) => ({
      medianKg,
      iconType: iconType.replace(/^bombs_(small|middle|large|heavy)$/, "napalm_$1"),
    }))
    .filter((b) => b.iconType.startsWith("napalm_"));
}

export function matchBombIcons(
  bombs: Bomb[],
  defs: WeaponDef[],
): { matches: Map<string, IconMatch>; unmatched: Bomb[] } {
  const matches = new Map<string, IconMatch>();
  const unmatched: Bomb[] = [];
  const buckets = buildFallbackBuckets(defs);
  const incendiaryBuckets = buildIncendiaryBuckets(buckets);
  const byPath = new Map(defs.map((d) => [d.path, d]));

  for (const bomb of bombs) {
    const aliasPath = ICON_ALIASES[bomb.chartName];
    if (aliasPath) {
      const def = byPath.get(aliasPath);
      const iconType = def?.iconType ?? (def?.isMine ? "air_mines" : null);
      if (iconType) {
        matches.set(bomb.id, { iconType, confidence: "matched" });
        continue;
      }
    }

    if (bomb.massKg === null) {
      // The two chart entries with neither a real weight nor a datamine file at
      // all — a plain per-kind default beats leaving the tile blank.
      const fallback = bomb.kind === "INC" ? "napalm_middle" : "bombs_middle";
      matches.set(bomb.id, { iconType: fallback, confidence: "fallback" });
      continue;
    }

    const byMass = defs.filter((d) => d.massKg !== null && massMatches(bomb.massKg!, d.massKg!));
    const best = byMass.length > 0 ? pickBest(bomb, byMass) : null;
    const iconType = best?.iconType ?? (best?.isMine ? "air_mines" : null);

    if (iconType) {
      matches.set(bomb.id, { iconType, confidence: "matched" });
      continue;
    }

    // Nothing at this mass fits the kind — fall back to whichever size class its
    // mass sits closest to, which is always a reasonable stand-in.
    const table = bomb.kind === "INC" ? incendiaryBuckets : buckets;
    const bucket = nearestBucket(bomb.massKg!, table);
    if (bucket) matches.set(bomb.id, { iconType: bucket.iconType, confidence: "fallback" });
    else unmatched.push(bomb);
  }

  return { matches, unmatched };
}
