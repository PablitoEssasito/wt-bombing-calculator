import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildModel, readCurve, zoneDamage, type BaseDamageModel } from "../../src/domain/base-damage";
import type { Bomb, WeaponStats } from "../../src/domain/types";
import { normalizeBombName, slugifyBomb } from "../etl/aliases";
import { loadWpcost, WEAPON_PREFIXES, type Wpcost, type WpcostWeapon } from "../shared/wpcost";
import { mostCommon, sheetView } from "./reconcile";
import { armourPiercingOf, dragOf, explosivesOf, guidanceOf, payloadOf, statsOf, tntOf, type Category, type Explosives } from "./stats";

const RAW =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/aces.vromfs.bin_u/gamedata";

const ARMAMENT_DIR = path.join(process.cwd(), ".cache", "armament");
const UNITS_DIR = path.join(ARMAMENT_DIR, "raw");
const STORES_DIR = path.join(ARMAMENT_DIR, "stores");
const OUT = path.join(ARMAMENT_DIR, "stores.json");
/** One entry per round of ordnance — what the armament pages list. */
const OUT_ROUNDS = path.join(ARMAMENT_DIR, "rounds.json");
/** Shipped: the explosion model a base-damage estimate is read off (src/domain/base-damage.ts). */
const OUT_MODEL = path.join(process.cwd(), "src", "data", "base-damage-model.json");
const DAMAGE_MODEL_DIR = path.join(ARMAMENT_DIR, "damage_model");

const CONCURRENCY = 10;

/** What a hardpoint is carrying, coarsely — the grouping the game's own menu uses. */
export type StoreKind =
  | "bomb"
  | "mine"
  | "torpedo"
  | "rocket"
  | "missile"
  | "gun"
  | "tank"
  | "pod"
  | "countermeasure"
  | "other";

export type Store = {
  /** File basename, the key hardpoint options refer to. */
  file: string;
  /** The game's own name for it, as the loadout menu shows it. */
  name: string | null;
  /** The shorter name the game uses where space is tight. */
  short: string | null;
  massKg: number | null;
  kind: StoreKind;
  /**
   * What this delivers in bomb-chart terms, so a build can be priced.
   *
   * A rack resolves to its contents with a count: `bru_3a_us_750lb_m117_x6` is
   * six M117s, and pricing it as one store would understate it sixfold. Null for
   * anything the chart does not cover — missiles, tanks, and the handful of
   * glide bombs it never catalogued.
   */
  bomb: { id: string; count: number } | null;
  /**
   * How many rounds this store comes to once every rack and rail is opened —
   * a twin R-60M rail holds two, a nineteen-tube pod holds nineteen, a bare
   * bomb holds one. Independent of whether the chart prices what is inside,
   * which is what lets a missile rail be counted at all.
   */
  holds: number;
  /**
   * The game's own UI icon key, resolved through the same rack/rail chain as
   * `holds` — a rail carries none of its own, the missile it holds does. Null
   * for the kinds (tanks, torpedoes, most of `other`) the game draws with no
   * per-weapon icon at all.
   */
  iconType: string | null;
  /**
   * What the game's weapon tooltip treats the ordnance inside as — which
   * decides the figures it shows. Null for what is no weapon: tanks, pods,
   * flares.
   */
  category: Category | null;
  /**
   * The key the game labels the ordnance inside's guidance by, resolved like
   * `iconType`: "laser+IOG+GNSS" for a Paveway IV — see `guidanceOf` in
   * stats.ts. Null for anything unguided.
   */
  guidance: string | null;
  /**
   * The game's own price for the whole store against a base, rack and all:
   * `weaponDamage` in wpcost.blkx. Null where the game prices none.
   */
  damage: number | null;
  /**
   * Whether this file itself holds something else — a rack, a rail, a launcher
   * pod — as opposed to being ordnance in its own right.
   *
   * This is what tells a repeat count on a hardpoint choice apart from a round
   * count on a gun: only a container's own multiplier is a physical quantity.
   * See `isPhysicalCount`.
   */
  container: boolean;
};

const many = <T,>(value: unknown): T[] =>
  value === undefined || value === null ? [] : ((Array.isArray(value) ? value : [value]) as T[]);

const LANG_CSV =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/lang.vromfs.bin_u/lang/units_weaponry.csv";
const LANG_CACHE = path.join(ARMAMENT_DIR, "units_weaponry.csv");

/**
 * The game's own names for its weapons, English column.
 *
 * Rows are keyed `weapons/<file>`, with a `/short` variant beside each — the two
 * forms the loadout menu itself picks between, which is why both are kept rather
 * than prettifying a file name into something the player has never seen.
 */
async function weaponNames(
  useCache: boolean,
): Promise<{ full: Map<string, string>; short: Map<string, string> }> {
  let csv: string;
  if (useCache && existsSync(LANG_CACHE)) {
    csv = await readFile(LANG_CACHE, "utf8");
  } else {
    const response = await fetch(LANG_CSV);
    if (!response.ok) throw new Error(`weapon names: HTTP ${response.status}`);
    csv = await response.text();
    await writeFile(LANG_CACHE, csv, "utf8");
  }

  const full = new Map<string, string>();
  const short = new Map<string, string>();
  for (const line of csv.split("\n")) {
    const match = /^"([^"]+)";"([^"]*)"/.exec(line);
    if (!match) continue;
    const [, key, english] = match;
    if (!key.startsWith("weapons/") || !english) continue;
    const isShort = key.endsWith("/short");
    const file = key.slice("weapons/".length).replace(/\/short$/, "").toLowerCase();
    (isShort ? short : full).set(file, english);
  }
  return { full, short };
}

export const storeFile = (blkReference: string) =>
  blkReference.split("/").pop()!.replace(/\.blkx?$/i, "").toLowerCase();

/** `gameData/Weapons/rocketGuns/us_aim9m.blk` is served as `weapons/rocketguns/us_aim9m.blkx`. */
export const storePath = (blkReference: string) =>
  blkReference.replace(/^gameData\//i, "").toLowerCase().replace(/\.blkx?$/i, ".blkx");

/**
 * Sorts a store into the group the loadout menu would file it under.
 *
 * The directory decides most of it, since the game keeps bombs, rockets and drop
 * tanks apart already. Within rocketguns the two that matter are told apart by
 * whether the file describes guidance, which is what separates an AIM-9 from a
 * plain HVAR.
 */
export function classify(reference: string, body: Record<string, unknown>): StoreKind {
  const dir = reference.toLowerCase();
  const payload = (body.rocket ?? body.bomb ?? body.torpedo ?? {}) as Record<string, unknown>;

  if (dir.includes("/bombguns/")) return "bomb";
  if (dir.includes("/mines/")) return "mine";
  if (dir.includes("/torpedoes/")) return "torpedo";
  if (dir.includes("/drop_tank/")) return "tank";
  if (dir.includes("/containers/")) return "pod";
  if (dir.includes("/rocketguns/")) {
    if (/countermeasure|flare|chaff/.test(dir)) return "countermeasure";
    // Wire- and radio-steered ones state no guidance block, only that they are flown.
    return payload.guidance != null || body.guidance != null || payload.operated === true ? "missile" : "rocket";
  }
  if (/^weapons\/(cannon|gun|mg)/.test(dir) || /cannon|gun/.test(dir.split("/").pop() ?? "")) {
    return "gun";
  }
  return "other";
}

/**
 * The game's own UI icon key for a store, read the same way the bomb-icons
 * pipeline reads it for a `bombguns/` file — except here it stands on its own,
 * with no chart to fall back on if it comes up empty. It does for torpedoes
 * and most of `other` (targeting pods, data links); everything else the
 * loadout menu shows an icon for states one directly, missiles included.
 *
 * Fuel tanks are the one deliberate exception: not one of 198 drop-tank files
 * anywhere in the data carries an `iconType` of its own, because the game
 * doesn't draw one per tank — every capacity, every nation, shows the same
 * "ptb" icon in the loadout menu (confirmed against the wiki's own vehicle
 * pages, which embed the exact icon key: F-16A, MiG-29, Su-25 and F-4E all
 * point at `gui_skin/ptb.png` for a drop tank regardless of its size).
 */
function iconTypeOf(body: Record<string, unknown>, kind: StoreKind): string | null {
  if (kind === "tank") return "ptb";
  const payload = (body.rocket ?? body.bomb ?? body.torpedo ?? {}) as Record<string, unknown>;
  const candidate = body.iconType ?? payload.iconType;
  return typeof candidate === "string" ? candidate : null;
}

/** What a store weighs on its own, before anything it might be holding. */
function ownMass(body: Record<string, unknown>): number | null {
  const warhead = (body.rocket ?? body.bomb ?? body.torpedo ?? {}) as Record<string, unknown>;
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  for (const candidate of [warhead.mass, body.mass, payload.mass]) {
    if (typeof candidate === "number") return candidate;
  }
  return null;
}

/** The file a launch rail or rack points at, and how many of them it holds. */
export function contained(body: Record<string, unknown>): { blk: string; count: number } | null {
  if (body.container !== true || typeof body.blk !== "string") return null;
  return { blk: body.blk, count: typeof body.bullets === "number" ? body.bullets : 1 };
}

/**
 * Whether a repeat count next to a weapon reference means physical quantity.
 *
 * A flight model's own Weapon entry carries a `bullets` field whichever kind of
 * store it names, but the field means two different things depending on what is
 * on the other end. Pointed at a container — a rack, a rail, a launcher pod —
 * it is how many of that whole unit are hung, verified against the AIM-9 twin
 * rail (2 missiles) and the Zuni LAU-35 (2 pods). Pointed at a gun or a
 * countermeasure dispenser, the same field is its ammunition: every one of the
 * 156 non-container files seen with `bullets` above 1 is a cannon or a flare/
 * chaff launcher, and the number is rounds, not spare gun pods — the BK-27
 * reads `bullets: 150` for a real 150-round magazine on one physical cannon.
 * Bombs referenced directly, never through a container, are never seen with
 * `bullets` above 1 at all, so this affects nothing about how bombs are counted.
 */
export function isPhysicalCount(store: { container: boolean }): boolean {
  return store.container;
}

/**
 * Weighs a store, following a rail or rack to whatever it carries.
 *
 * A third of the stores state no mass of their own because they are not stores at
 * all: `aero_3b_aim9b` is a rail that holds two AIM-9Bs and says so by pointing at
 * the missile's file, which need not be hung anywhere itself.
 *
 * Where a rack does state a weight it is the rack's own, and counts on top of what
 * it carries rather than instead of it — read as the whole story it puts the
 * triple adapter `auf_1_tri_us_gbu_12_x2` at 80 kg while it holds two 277 kg
 * Paveways.
 */
function massOfStore(
  file: string,
  bodies: Map<string, Record<string, unknown>>,
  seen = new Set<string>(),
): number | null {
  const body = bodies.get(file);
  if (!body || seen.has(file)) return null;
  seen.add(file);

  const own = ownMass(body);
  const inner = contained(body);
  if (!inner) return own;
  const innerMass = massOfStore(storeFile(inner.blk), bodies, seen);
  if (innerMass === null) return own;
  return (own ?? 0) + innerMass * inner.count;
}

/**
 * The innermost weapon a store delivers, and how many of it.
 *
 * Racks nest: a pylon adapter holds a rack which holds the bombs. Walking to the
 * bottom is what makes a rack priceable, since only the bomb at the end of the
 * chain appears in the bomb chart.
 */
function innermost(
  file: string,
  bodies: Map<string, Record<string, unknown>>,
  seen = new Set<string>(),
): { file: string; count: number } {
  const body = bodies.get(file);
  const inner = body ? contained(body) : null;
  if (!inner || seen.has(file)) return { file, count: 1 };
  seen.add(file);

  const deeper = innermost(storeFile(inner.blk), bodies, seen);
  return { file: deeper.file, count: deeper.count * inner.count };
}

/** A mark written in Roman numerals, the way the game spells what the sheet writes "Mk.1". */
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

const wordsOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/\bmk[\s.]*(x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g, (_, roman: string) => `mk ${ROMAN[roman]}`)
    .replace(/\(.*?\)/g, " ")
    // Spelled apart in the chart, together in the game.
    .replace(/snake\s*eye/g, "snakeye")
    // "LDGP" is in some names on either side and not in others: the chart's
    // "500 lb LDGP Mk 82 AIR" is the game's "500 lb Mk 82 AIR".
    .replace(/\b(bomb|bombs|mine|torpedo|ldgp)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const normalizeName = (value: string) => wordsOf(value).join("");

/** Words the game ends a name with that only describe the weapon, never tell two apart. */
const DESCRIPTIVE = new Set([
  "guided",
  "glide",
  "missile",
  "armor",
  "piercing",
  "high",
  "drag",
  "tail",
  "fin",
  "retarded",
  "ballute",
  "type",
  "demolition",
]);

/**
 * Every whole-word start of a name, run together — "KAB-500L guided" gives
 * kab, kab500l, kab500lguided — each with whether something follows it and
 * all of that only describes the weapon (true for kab500l, false for the
 * whole name).
 */
function wordPrefixes(value: string): Map<string, boolean> {
  const words = wordsOf(value);
  const prefixes = new Map<string, boolean>();
  let running = "";
  words.forEach((word, i) => {
    running += word;
    const rest = words.slice(i + 1);
    prefixes.set(running, rest.length > 0 && rest.every((word) => DESCRIPTIVE.has(word)));
  });
  return prefixes;
}

/** What a name says in brackets — "(1938)", "(SBU 54)" — which tells apart bombs the rest of it does not. */
const bracketed = (value: string) =>
  [...value.toLowerCase().matchAll(/\((.*?)\)/g)].map((m) => m[1].replace(/[^a-z0-9]+/g, "")).filter(Boolean);

/**
 * Ties a weapon file to the bomb chart entry that prices it.
 *
 * The chart's name sits at the front of the game's, which finishes the sentence:
 * "250 kg BRP 250" against "250 kg BRP 250 high-drag tail fin retarded bomb". So
 * the test is a prefix, longest first — otherwise "Mk 82" would claim the Mk 82
 * AIR before the AIR entry got a look — and a prefix of whole words: run
 * together, the game's "KAB-500L guided" starts with the chart's "KAB-500LG".
 *
 * A short prefix is not enough to trust: the chart's "BAFG 230" also leads the
 * game's "BA-FG-230-Lizard-2", a different weapon 29 kg heavier. So a short name
 * has to be backed by the weight agreeing, while a long one stands on its own —
 * which it has to, because the two sources weigh retarded bombs differently. The
 * chart gives the SAMP Type 25 200 as 247 kg and the game as 264, the difference
 * being the parachute assembly, and demanding agreement there loses a bomb both
 * sources plainly describe. A short name the game only adds description to
 * stands on its own too: the game weighs guided bombs with their kit, so its
 * "SPICE 1000 guided bomb" is 490 kg to the chart's 454. A missile takes that
 * or nothing — the chart's 10 kg SD10 leads the game's SD-10 air-to-air
 * missile — and the same name word for word earns no such trust: the game's
 * torpedo "Mk.13" is not the chart's guided bomb.
 *
 * Between names of the same length, one the weight agrees with wins, then
 * one retarded or not as the game's says — the chart lists "120 kg m/71" as
 * both — then one whose brackets the game's repeats: "BRAB-1000 (1938)" is not
 * the later BRAB-1000. And where the brackets disagree outright, they name the bomb: the
 * game's "Paveway II (Mk.13)" is the chart's Mk.13, not its "Paveway II (Mk.18)".
 *
 * Nothing is matched on weight alone. Falling back to it tied exactly three
 * stores and got all three wrong, the worst pricing a Mk.13 torpedo as a BGL-1000
 * guided bomb — a weight that happens to be unique in the chart says only that,
 * and the chart is not a complete catalogue of what the game hangs.
 */
/**
 * Chart names the sheet misspells against the game's own, corrected before
 * matching. There is no "FeBd" in the game: its 400 kg Napalmbombe is the
 * FeBb (sws_400kg_febb_napalmbombe), priced at the 12 943 the chart gives.
 */
const CHART_NAME_CORRECTIONS: Record<string, string> = {
  FeBd: "FeBb",
  "400 kg FeBd Napalmbombe": "400 kg FeBb Napalmbombe",
};

/** Normalised characters beyond which a leading match is too specific to be chance. */
const TRUSTED_PREFIX = 10;
function matchBomb(
  store: { file: string; massKg: number | null; missile: boolean; kind: string },
  names: { full: string | null; short: string | null },
  chart: { id: string; chartName: string; fullName: string; massKg: number | null; kind: string }[],
): string | null {
  const agrees = (bombMass: number | null) =>
    store.massKg === null ||
    bombMass === null ||
    Math.abs(store.massKg - bombMass) <= Math.max(1, store.massKg * 0.02);

  const keyed = chart
    .flatMap((bomb) =>
      [bomb.fullName, bomb.chartName]
        .filter(Boolean)
        .map((name) => ({ bomb, key: normalizeName(name), words: wordsOf(name) })),
    )
    .filter((entry) => entry.key.length >= 4)
    .sort((a, b) => b.key.length - a.key.length);

  for (const candidate of [names.full, names.short]) {
    if (!candidate) continue;
    const prefixes = wordPrefixes(candidate);
    const hits = keyed.filter(
      (entry) =>
        prefixes.has(entry.key) &&
        (store.missile
          ? prefixes.get(entry.key)
          : entry.key.length >= TRUSTED_PREFIX || agrees(entry.bomb.massKg) || prefixes.get(entry.key)),
    );
    if (hits.length === 0) continue;

    const brackets = bracketed(candidate);
    const retarded = /retarded|high-drag|ballute/i.test(candidate);
    const score = (entry: (typeof keyed)[number]) =>
      (agrees(entry.bomb.massKg) ? 100 : 0) +
      ((entry.bomb.kind === "DRAG") === retarded ? 10 : 0) +
      bracketed(entry.bomb.fullName).filter((b) => brackets.includes(b)).length;
    const best = hits
      .filter((entry) => entry.key.length === hits[0].key.length)
      .reduce((top, entry) => (score(entry) > score(top) ? entry : top));

    const own = bracketed(best.bomb.fullName);
    if (own.length > 0 && brackets.length > 0 && !own.some((b) => brackets.includes(b))) {
      // Only a row the weight agrees with — "(Mk.13)" on a torpedo names no bomb.
      const named = keyed.find(
        (entry) => brackets.includes(entry.key) && !store.missile && agrees(entry.bomb.massKg),
      );
      if (named) return named.bomb.id;
    }
    return best.bomb.id;
  }

  // Failing a whole-word match, a part-word one the weight backs up: the
  // game's "GP 100T" is the chart's 100 kg "GP 100", while its 1 000 kg
  // Walleye II weighs nothing like the chart's Walleye I.
  for (const candidate of store.missile ? [] : [names.full, names.short]) {
    if (!candidate) continue;
    const key = normalizeName(candidate);
    const hit = keyed.find((entry) => key.startsWith(entry.key) && agrees(entry.bomb.massKg));
    if (hit) return hit.bomb.id;
  }

  // Last, a long name whose every word the game's repeats, in any order and
  // among others, the weight agreeing: the chart's "M.C.1000 lb Mk.I" is the
  // game's "1000 lb M.C. Mk.I", its Type A magnetic mine the game's "aircraft
  // laid" one.
  for (const candidate of store.missile ? [] : [names.full, names.short]) {
    if (!candidate) continue;
    const words = new Set(wordsOf(candidate));
    const hit = keyed.find(
      (entry) =>
        entry.key.length >= TRUSTED_PREFIX && entry.words.every((word) => words.has(word)) && agrees(entry.bomb.massKg),
    );
    if (hit) return hit.bomb.id;
  }

  // Last of all, a bomb the game calls by exactly one chart row's name,
  // whatever it weighs: the chart gives the GBU-8 as its 2 000 lb class and the
  // game weighs the kit too, 1 027 kg, and the GB3, "Mk.2" and "500 kg No.2"
  // miss the same way — the first two too short a name to trust as a prefix.
  // Their fillings agree. Not a missile or torpedo: the game's torpedo "Mk.13"
  // is still not the chart's guided bomb.
  if (store.kind === "bomb" || store.kind === "mine") {
    for (const candidate of [names.short, names.full]) {
      if (!candidate) continue;
      const key = normalizeName(candidate);
      const named = chart.filter((bomb) =>
        [bomb.chartName, bomb.fullName].some((name) => name && normalizeName(name) === key),
      );
      if (key && named.length === 1) return named[0].id;
    }
  }

  return null;
}

/**
 * Every distinct weapon file any aircraft can hang — from its hardpoints, and
 * from its ready-made setups, which are all a bomber like the Pe-8 has: its
 * FAB-5000 is named in a setup and nowhere else.
 *
 * The site's own aircraft come from their flight models; every other aircraft
 * in the game from the price list, which names each store it can carry
 * (`<kind>_<file>`, the kind being the directory the file lives in). Files hung
 * from a pylon are marked too: that is what tells a gun pod from an aircraft's
 * own guns, which a fixed setup names alongside its bombs.
 */
async function referenced(wpcost: Wpcost): Promise<{
  files: Map<string, string>;
  onPylon: Set<string>;
  carriers: Map<string, Set<string>>;
  triggers: Map<string, Set<string>>;
}> {
  const byFile = new Map<string, string>();
  const onPylon = new Set<string>();
  // Which aircraft each file hangs from, by unit — the price list's own list
  // misses what an older fixed setup hangs, which only the flight model names.
  const carriers = new Map<string, Set<string>>();
  // The triggers each file is mounted with: what tells an air-to-air missile
  // from an air-to-ground one in the game's own tooltip.
  const triggers = new Map<string, Set<string>>();
  const carriedBy = (file: string, unit: string, trigger: unknown) => {
    carriers.set(file, (carriers.get(file) ?? new Set()).add(unit));
    if (typeof trigger === "string") triggers.set(file, (triggers.get(file) ?? new Set()).add(trigger));
  };
  for (const name of await readdir(UNITS_DIR)) {
    const unit = name.replace(/\.json$/, "");
    const raw = JSON.parse(await readFile(path.join(UNITS_DIR, name), "utf8")) as {
      fm: { WeaponSlots?: { WeaponSlot?: unknown } };
      presets?: Record<string, { Weapon?: unknown }>;
    };
    for (const preset of Object.values(raw.presets ?? {})) {
      for (const weapon of many<Record<string, unknown>>(preset.Weapon)) {
        if (typeof weapon.blk !== "string") continue;
        byFile.set(storeFile(weapon.blk), weapon.blk);
        carriedBy(storeFile(weapon.blk), unit, weapon.trigger);
      }
    }
    for (const slot of many<Record<string, unknown>>(raw.fm.WeaponSlots?.WeaponSlot)) {
      if (Number(slot.index) <= 0) continue;
      for (const preset of many<Record<string, unknown>>(slot.WeaponPreset)) {
        for (const weapon of many<Record<string, unknown>>(preset.Weapon)) {
          if (typeof weapon.blk !== "string") continue;
          byFile.set(storeFile(weapon.blk), weapon.blk);
          onPylon.add(storeFile(weapon.blk));
          carriedBy(storeFile(weapon.blk), unit, weapon.trigger);
        }
      }
    }
  }
  for (const [key, weapon] of Object.entries(wpcost.weapons)) {
    if (weapon.units.length === 0) continue;
    const prefix = WEAPON_PREFIXES.find((p) => key.startsWith(`${p}_`))!;
    const file = key.slice(prefix.length + 1).toLowerCase();
    if (!byFile.has(file)) byFile.set(file, `gameData/Weapons/${prefix}/${file}.blk`);
    onPylon.add(file);
    for (const unit of weapon.units) carriedBy(file, unit, undefined);
  }
  return { files: byFile, onPylon, carriers, triggers };
}

/** The price list's entry for a store file, whichever kind the game files it under. */
function wpcostOf(file: string, wpcost: Wpcost): WpcostWeapon | undefined {
  for (const prefix of WEAPON_PREFIXES) {
    const entry = wpcost.weapons[`${prefix}_${file}`];
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Sorts one round the way the game's weapon selector would: a bomb with a
 * seeker (or flown by radio, like the Fritz X) is a guided bomb; a missile is
 * air-to-air or air-to-ground as the price list files it — the one place the
 * game states which — and by what its seeker is set to look for where the
 * price list is silent.
 */
/**
 * What the tooltip files a store under. A missile goes by the trigger the
 * aircraft mount it with — the tooltip's own rule (`WEAPON_TYPE.AAM` for the
 * "aam" trigger, `AGM` for "agm" and "atgm"). Where no flight model names one,
 * a missile steered along a line of sight (SACLOS, beam riding) is for the
 * ground, whatever role the price list gives it; then that role; then its seeker.
 */
export function categoryOf(
  kind: StoreKind,
  payload: Record<string, unknown>,
  role: WpcostWeapon["role"],
  triggers: ReadonlySet<string>,
): Category | null {
  switch (kind) {
    case "bomb":
      return payload.guidance != null || payload.operated === true ? "guidedBomb" : "bomb";
    case "mine":
      return "mine";
    case "torpedo":
      return "torpedo";
    case "rocket":
      return "rocket";
    case "gun":
      return "gun";
    case "missile": {
      const airToAir = triggers.has("aam");
      const airToGround = triggers.has("agm") || triggers.has("atgm");
      if (airToAir !== airToGround) return airToAir ? "aam" : "agm";
      const guidance = (payload.guidance ?? {}) as Record<string, unknown>;
      if (guidance.lineOfSightAutopilot != null) return "agm";
      if (role === "aam") return "aam";
      if (role === "agm" || role === "guidedBomb") return "agm";
      const optical = (guidance.opticalSeeker ?? {}) as Record<string, unknown>;
      const radar = (guidance.radarSeeker ?? {}) as Record<string, unknown>;
      const againstGround =
        payload.operated === true ||
        optical.groundVehiclesAsTarget === true ||
        optical.surfaceAsTarget === true ||
        radar.targetSignatureType === "radarIntercept" ||
        (typeof payload.guidanceType === "string" && ["laser", "sns"].includes(payload.guidanceType));
      return againstGround ? "agm" : "aam";
    }
    default:
      return null;
  }
}

/** What a base-damage estimate can be made for: a blast meant for the ground. */
const ESTIMATED: ReadonlySet<Category> = new Set(["bomb", "guidedBomb", "rocket", "agm"]);

/** One round of ordnance — a bomb, a missile, a torpedo — and what it takes to price it. */
export type Round = {
  /** Its own file, the one every rack and rail holding it comes down to. */
  file: string;
  name: string | null;
  short: string | null;
  category: Category;
  /** The chart row it prices as, or the game-only row made for it. */
  bombId: string | null;
  /** Damage to a base, and where that figure comes from. */
  damage: number | null;
  damageSource: "game" | "estimate" | null;
  tntKg: number | null;
  /** A fire bomb, priced by what it burns rather than by its blast. */
  incendiary: boolean;
  /** A bomb slowed by a parachute or fins so it can be dropped low. */
  drag: boolean;
  /** A kinetic bomb, or a blast bomb that also pierces. */
  armourPiercing: "ap" | "sap" | null;
  iconType: string | null;
  stats: WeaponStats;
  /** Every aircraft in the game that can carry it, by the price list's unit name. */
  units: string[];
};

async function loadDamageModelFile(name: string, useCache: boolean): Promise<Record<string, unknown>> {
  const cachePath = path.join(DAMAGE_MODEL_DIR, `${name}.json`);
  if (useCache && existsSync(cachePath)) return JSON.parse(await readFile(cachePath, "utf8"));
  const response = await fetch(`${RAW}/damage_model/${name}.blkx`);
  if (!response.ok) throw new Error(`damage_model/${name}: HTTP ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  await mkdir(DAMAGE_MODEL_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(body), "utf8");
  return body;
}

/**
 * The bombing zone's armour and the blast table to hold it against — the two
 * things the model needs besides the game's own prices (see base-damage.ts).
 */
function zoneOf(armorClasses: Record<string, unknown>, explosives: Explosives) {
  const zone = (armorClasses.bombing_zone ?? {}) as Record<string, unknown>;
  const armorThickness = zone.armorThickness;
  const restrain = zone.restrainExplosionDamage;
  if (typeof armorThickness !== "number" || typeof restrain !== "number") {
    throw new Error("armor_classes.blk: bombing_zone has no armorThickness/restrainExplosionDamage");
  }
  return { armorThickness, restrain, penetration: explosives.splash.penetration };
}

/**
 * Two prices for one weapon: a round's share of a rack's price is rounded, so
 * a pair priced 761 puts each HVAR at 381 against the lone one's 380.
 */
const samePrice = (a: number, b: number) => Math.abs(a - b) <= 1;

/**
 * What a round is priced at inside the fixed setups that hang it alone: the
 * setup's price over its rounds. The only price the game gives a bomb only a
 * bomber's bay carries — the Pe-8's FAB-5000 is priced as `pe-8_fab5000`,
 * 30 521 for its one bomb, and nowhere on its own. A setup mixing two kinds of
 * round says nothing of either.
 */
async function fixedSetupShares(
  wpcost: Wpcost,
  coreOf: Map<string, { file: string; count: number }>,
): Promise<Map<string, number[]>> {
  const shares = new Map<string, number[]>();
  for (const name of await readdir(UNITS_DIR)) {
    const unit = name.replace(/\.json$/, "");
    const prices = wpcost.presets[unit];
    if (!prices) continue;
    const raw = JSON.parse(await readFile(path.join(UNITS_DIR, name), "utf8")) as {
      presets?: Record<string, { Weapon?: unknown }>;
    };
    for (const [preset, body] of Object.entries(raw.presets ?? {})) {
      const price = prices[preset];
      if (price === undefined) continue;
      const rounds = new Map<string, number>();
      for (const weapon of many<Record<string, unknown>>(body.Weapon)) {
        if (typeof weapon.blk !== "string") continue;
        const core = coreOf.get(storeFile(weapon.blk));
        if (!core) continue;
        const bullets = typeof weapon.bullets === "number" ? weapon.bullets : 1;
        rounds.set(core.file, (rounds.get(core.file) ?? 0) + bullets * core.count);
      }
      if (rounds.size !== 1) continue;
      const [[file, count]] = [...rounds];
      shares.set(file, [...(shares.get(file) ?? []), Math.round(price / count)]);
    }
  }
  return shares;
}

async function main() {
  const useCache = process.argv.includes("--cache");
  const wpcost = await loadWpcost(useCache);
  const { files: hung, onPylon, carriers, triggers } = await referenced(wpcost);
  console.log(`${hung.size} distinct stores hang from hardpoints across the game's aircraft`);

  await mkdir(STORES_DIR, { recursive: true });

  const bodies = new Map<string, Record<string, unknown>>();
  const references = new Map(hung);
  const missing: string[] = [];
  let queue = [...hung.entries()];
  let done = 0;

  async function fetchOne([file, reference]: [string, string]) {
    const cachePath = path.join(STORES_DIR, `${file}.json`);
    if (useCache && existsSync(cachePath)) {
      bodies.set(file, JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>);
      return;
    }
    const response = await fetch(`${RAW}/${storePath(reference)}`);
    if (!response.ok) return void missing.push(file);
    try {
      const body = (await response.json()) as Record<string, unknown>;
      await writeFile(cachePath, JSON.stringify(body), "utf8");
      bodies.set(file, body);
    } catch {
      missing.push(file);
    }
  }

  // Rails point at the missiles they hold, which need not be hung anywhere
  // themselves, so keep pulling until nothing new is referenced.
  while (queue.length > 0) {
    const batch = queue;
    queue = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map(fetchOne));
      done += Math.min(CONCURRENCY, batch.length - i);
      if (done % 200 < CONCURRENCY) console.log(`  ${done} read...`);
    }
    for (const body of bodies.values()) {
      const inner = contained(body);
      if (!inner) continue;
      const innerFile = storeFile(inner.blk);
      if (!references.has(innerFile)) {
        references.set(innerFile, inner.blk);
        queue.push([innerFile, inner.blk]);
      }
    }
  }

  const names = await weaponNames(useCache);
  const explosives = explosivesOf(await loadDamageModelFile("explosive", useCache));
  const zone = zoneOf(await loadDamageModelFile("armor_classes", useCache), explosives);
  const allRows = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "bombs.json"), "utf8"),
  ) as Bomb[];
  // Only the sheet's own rows, with the sheet's own figures: rows the last
  // import made from the game alone, or figures it overruled, must not steer
  // this one's matching — it would drift from run to run.
  const chart = allRows
    .filter((row) => row.source !== "game")
    .map(sheetView)
    .map((row) => ({
      ...row,
      chartName: CHART_NAME_CORRECTIONS[row.chartName] ?? row.chartName,
      fullName: CHART_NAME_CORRECTIONS[row.fullName] ?? row.fullName,
    }));

  // A rail is what an aircraft mounts, the missile it holds what it fires:
  // every rail's triggers count for its missile.
  const coreTriggers = new Map<string, Set<string>>();
  for (const [file, mounted] of triggers) {
    if (!bodies.has(file)) continue;
    const core = innermost(file, bodies).file;
    coreTriggers.set(core, new Set([...(coreTriggers.get(core) ?? []), ...mounted]));
  }

  const stores: Store[] = [];
  const coreOf = new Map<string, { file: string; count: number }>();
  for (const [file, reference] of hung) {
    const body = bodies.get(file);
    if (!body) continue;

    const core = innermost(file, bodies);
    coreOf.set(file, core);
    // The directory is what says whether a file is a bomb or a missile, so the
    // core's own reference has to be used rather than a path rebuilt from its name.
    const coreRef = storePath(references.get(core.file) ?? reference);
    const coreBody = bodies.get(core.file) ?? body;
    const coreNames = { full: names.full.get(core.file) ?? null, short: names.short.get(core.file) ?? null };
    const coreMass = massOfStore(core.file, bodies);

    const kind = classify(coreRef, coreBody);
    const payload = payloadOf(coreBody) ?? {};
    const category = categoryOf(kind, payload, wpcostOf(core.file, wpcost)?.role, coreTriggers.get(core.file) ?? new Set());
    // Missiles too: the chart prices the few that bomb bases, rocket-boosted
    // guided bombs like the AGM-123 Skipper the game files as missiles.
    const bombId = ["bomb", "mine", "torpedo", "rocket", "missile"].includes(kind)
      ? matchBomb({ file: core.file, massKg: coreMass, missile: kind === "missile", kind }, coreNames, chart)
      : null;

    stores.push({
      file,
      // A rail takes the name of what it holds when it has none of its own.
      name: names.full.get(file) ?? coreNames.full,
      short: names.short.get(file) ?? coreNames.short,
      massKg: massOfStore(file, bodies),
      // ...and is filed under it too, the way the loadout menu lists it.
      kind,
      bomb: bombId ? { id: bombId, count: core.count } : null,
      holds: core.count,
      // ...and its icon lives there too, same as the name and kind above.
      iconType: iconTypeOf(coreBody, kind),
      category,
      guidance: category && category !== "gun" ? (guidanceOf(payload) ?? null) : null,
      damage: wpcostOf(file, wpcost)?.weaponDamage ?? null,
      container: contained(body) !== null,
    });
  }

  const setupShares = await fixedSetupShares(wpcost, coreOf);
  const rounds = roundsOf(stores, coreOf, bodies, names, wpcost, explosives, onPylon, carriers, setupShares);
  const model = buildModel(pricedBlasts([...rounds.values()]), zone);
  for (const round of rounds.values()) {
    // A nuclear bomb whose file gives no yield holds a token charge (10 g on the
    // Mark 6), and its price is that charge's: the blast is not in the file.
    if (round.short?.startsWith("☢") && !round.stats.nuclearYieldKt) {
      round.damage = null;
      round.damageSource = null;
      continue;
    }
    if (round.damage !== null || !ESTIMATED.has(round.category) || round.incendiary) continue;
    if (round.stats.nuclearYieldKt) {
      round.damage = Math.round(readCurve(explosives.nuclearDamage, round.stats.nuclearYieldKt));
      round.damageSource = "game";
    } else if (round.tntKg) {
      round.damage = zoneDamage(round.tntKg, model);
      round.damageSource = "estimate";
    } else if (round.category === "rocket" && round.stats.explosiveType === undefined) {
      // No explosive at all — an AP or flechette rocket: the blast model gives it nothing.
      round.damage = 0;
      round.damageSource = "estimate";
    }
  }

  const rows = assignRows(rounds, stores, coreOf, chart);
  for (const store of stores) {
    const round = rounds.get(coreOf.get(store.file)!.file);
    store.bomb = round?.bombId ? { id: round.bombId, count: store.holds } : null;
  }

  stores.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(OUT, JSON.stringify(stores), "utf8");
  const roundList = [...rounds.values()].sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(OUT_ROUNDS, JSON.stringify(roundList), "utf8");
  await writeFile(OUT_MODEL, JSON.stringify(model), "utf8");

  const byKind = new Map<StoreKind, number>();
  for (const s of stores) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
  const weighed = stores.filter((s) => s.massKg !== null).length;

  console.log(`\nread ${stores.length} stores, ${weighed} of them weighed`);
  console.log(
    "  " + [...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(", "),
  );
  console.log(
    `  ${stores.filter((s) => s.container).length} are containers — the only files whose ` +
      `hardpoint repeat count is a physical quantity rather than ammunition`,
  );

  const named = stores.filter((s) => s.name !== null).length;
  const iconed = stores.filter((s) => s.iconType !== null).length;
  console.log(`  ${named} carry the game's own name, ${iconed} its own icon`);

  const byCategory = new Map<string, number>();
  for (const round of roundList) byCategory.set(round.category, (byCategory.get(round.category) ?? 0) + 1);
  console.log(
    `\n${roundList.length} rounds of ordnance: ` +
      [...byCategory].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "),
  );
  const fromSheet = roundList.filter((r) => r.bombId && !rows.gameRows.has(r.bombId)).length;
  console.log(`  ${fromSheet} price as a sheet row, the rest as ${rows.gameRows.size} rows of the game's own`);
  if (rows.split.length > 0) {
    console.log(`  ${rows.split.length} split off a sheet row the game prices differently:`);
    for (const line of rows.split) console.log(`    ${line}`);
  }
  reportModel(model, roundList, zone);

  const noMass = stores.filter((s) => s.massKg === null);
  if (noMass.length > 0) {
    console.log(
      `warn  ${noMass.length} store(s) state no mass anywhere: ` +
        noMass.slice(0, 8).map((s) => s.file).join(", "),
    );
  }
  if (missing.length > 0) {
    console.log(`warn  ${missing.length} store file(s) could not be fetched: ${missing.slice(0, 6).join(", ")}`);
  }
}

/**
 * One entry per round of ordnance — the file at the bottom of every rack —
 * with the game's own price for it where there is one.
 *
 * The price list prices stores, not rounds: a bare bomb is priced on its own,
 * but a missile is often priced only on the rail holding two. So a round's
 * price is its own entry where it has one, and otherwise each holding store's
 * price shared out over what it holds — racks round to a whole point, so the
 * most common share is taken.
 */
function roundsOf(
  stores: Store[],
  coreOf: Map<string, { file: string; count: number }>,
  bodies: Map<string, Record<string, unknown>>,
  names: { full: Map<string, string>; short: Map<string, string> },
  wpcost: Wpcost,
  explosives: Explosives,
  onPylon: Set<string>,
  carriers: Map<string, Set<string>>,
  setupShares: Map<string, number[]>,
): Map<string, Round> {
  const rounds = new Map<string, Round>();
  for (const store of stores) {
    const core = coreOf.get(store.file)!;
    if (!store.category) continue;
    // A gun counts only as a pod on a pylon, not as the aircraft's own guns.
    if (store.category === "gun" && !onPylon.has(store.file)) continue;
    const body = bodies.get(core.file) ?? bodies.get(store.file)!;
    let round = rounds.get(core.file);
    if (!round) {
      const payload = payloadOf(body) ?? {};
      round = {
        file: core.file,
        name: names.full.get(core.file) ?? store.name,
        short: names.short.get(core.file) ?? store.short,
        category: store.category,
        bombId: null,
        damage: null,
        damageSource: null,
        tntKg: tntOf(payload, explosives) ?? null,
        incendiary: payload.fireDamage != null,
        drag: store.category === "bomb" && dragOf(payload),
        armourPiercing: store.category === "bomb" || store.category === "guidedBomb" ? armourPiercingOf(payload) : null,
        iconType: store.iconType,
        stats: statsOf(body, store.category, explosives),
        units: [],
      };
      rounds.set(core.file, round);
    }
    // Only aircraft the game lists in its price list: a unit id there is what
    // the game's own names and nations are keyed by.
    const units = [...(carriers.get(store.file) ?? [])].filter((unit) => wpcost.units[unit]?.unitMoveType === "air");
    round.units = [...new Set([...round.units, ...units])].sort();
  }

  for (const round of rounds.values()) {
    const own = wpcostOf(round.file, wpcost)?.weaponDamage;
    const shares = stores.flatMap((store) =>
      coreOf.get(store.file)?.file === round.file && store.damage !== null && store.holds > 0
        ? [Math.round(store.damage / store.holds)]
        : [],
    );
    const setups = setupShares.get(round.file) ?? [];
    const damage =
      own ?? (shares.length > 0 ? mostCommon(shares) : setups.length > 0 ? mostCommon(setups) : null);
    if (damage !== null) {
      round.damage = damage;
      round.damageSource = "game";
    }
  }
  return rounds;
}

/**
 * Which row each round prices as.
 *
 * A round the sheet names keeps the sheet's row — unless the game prices the
 * rounds tied to that row differently, in which case they are not one weapon:
 * the chart's "AN-M64A1" row caught the game's AN-M64A1 with its daisy-cutter
 * rod too, 2 496 to the row's 3 060. Most of the rounds keep the row (on a
 * tie, those the game prices as the sheet does); the rest are split off to
 * rows of their own — the one British HVAR among eight American ones.
 *
 * Every round the sheet has no row for gets one from the game: one per
 * weapon, several files the game names alike and prices and weighs the same
 * sharing it, the way the AIM-9M comes in one file per launch rail.
 */
function assignRows(
  rounds: Map<string, Round>,
  stores: Store[],
  coreOf: Map<string, { file: string; count: number }>,
  chart: { id: string; damageValue: number | null }[],
): { gameRows: Set<string>; split: string[] } {
  for (const store of stores) {
    const round = rounds.get(coreOf.get(store.file)!.file);
    if (round && store.bomb && !round.bombId) round.bombId = store.bomb.id;
  }

  const split: string[] = [];
  const byRow = new Map<string, Round[]>();
  for (const round of rounds.values()) {
    if (round.bombId) byRow.set(round.bombId, [...(byRow.get(round.bombId) ?? []), round]);
  }
  for (const [rowId, members] of byRow) {
    const priced = members.filter((r) => r.damageSource === "game");
    if (priced.every((r) => samePrice(r.damage!, priced[0].damage!))) continue;
    // Most of the row's rounds keep it; on a tie, the ones priced as the sheet prices it.
    const sheetDamage = chart.find((row) => row.id === rowId)?.damageValue ?? null;
    const votes = new Map<number, number>();
    for (const round of priced) {
      const price = [...votes.keys()].find((p) => samePrice(p, round.damage!)) ?? round.damage!;
      votes.set(price, (votes.get(price) ?? 0) + 1);
    }
    const keep = [...votes].sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(sheetDamage !== null && samePrice(b[0], sheetDamage)) - Number(sheetDamage !== null && samePrice(a[0], sheetDamage)) ||
        a[0] - b[0],
    )[0][0];
    for (const round of priced) {
      if (samePrice(round.damage!, keep)) continue;
      split.push(`${round.name ?? round.file} (${round.damage}) from "${rowId}" (${keep})`);
      round.bombId = null;
    }
  }

  const taken = new Set(chart.map((row) => row.id));
  const gameRows = new Set<string>();
  const byName = new Map<string, Round[]>();
  for (const round of [...rounds.values()].sort((a, b) => a.file.localeCompare(b.file))) {
    if (round.bombId) continue;
    const name = normalizeBombName(round.name ?? round.short ?? round.file);
    const key = [round.category, name, Math.round(round.stats.massKg ?? 0)].join("|");
    byName.set(key, [...(byName.get(key) ?? []), round]);
  }
  // Alike in name and weight, and priced alike: one weapon.
  const groups: Round[][] = [];
  for (const alike of byName.values()) {
    const sorted = [...alike].sort((a, b) => (a.damage ?? -1) - (b.damage ?? -1) || a.file.localeCompare(b.file));
    for (const round of sorted) {
      const last = groups.at(-1);
      const joins =
        last !== undefined &&
        alike.includes(last[0]) &&
        (round.damage === null ? last[0].damage === null : last[0].damage !== null && samePrice(round.damage, last[0].damage));
      if (joins) last.push(round);
      else groups.push([round]);
    }
  }
  // Where two weapons share a name, the plain id goes to the one that does most
  // to a base, then to the one whose file sorts first — the B61's 30 kt bomb,
  // not the killstreak's 10 g stand-in. Not by how many aircraft carry each,
  // which a patch moves all the time: an id (and the page, bookmarks and
  // changelog keyed by it) passes to the other weapon only if a patch reprices
  // one past the other.
  const firstFile = (members: Round[]) => members.map((round) => round.file).sort()[0];
  groups.sort((a, b) => (b[0].damage ?? -1) - (a[0].damage ?? -1) || firstFile(a).localeCompare(firstFile(b)));
  for (const members of groups) {
    const [first] = members;
    let id = slugifyBomb(first.short ?? first.name ?? first.file);
    if (taken.has(id)) id = slugifyBomb(`${first.short ?? first.name ?? ""} ${first.file}`);
    for (let n = 2; taken.has(id); n++) id = `${slugifyBomb(first.file)}-${n}`;
    taken.add(id);
    gameRows.add(id);
    for (const round of members) round.bombId = id;
  }
  return { gameRows, split };
}

/** The blasts the game prices itself: high explosive, neither a fire bomb nor a nuclear one. */
function pricedBlasts(rounds: Round[]): { tntKg: number; damage: number; file: string }[] {
  return rounds.flatMap((round) =>
    round.damageSource === "game" && !round.incendiary && !round.stats.nuclearYieldKt && round.tntKg
      ? [{ tntKg: round.tntKg, damage: round.damage!, file: round.file }]
      : [],
  );
}

/**
 * How well the model holds the game's own prices: every one reproduced, and
 * — the test of an estimate — each one worked out again with itself left out.
 */
function reportModel(model: BaseDamageModel, rounds: Round[], zone: Parameters<typeof buildModel>[1]) {
  const priced = pricedBlasts(rounds);
  const held = priced.filter((p) => Math.abs(zoneDamage(p.tntKg, model) - p.damage) <= 1).length;
  const errors = priced
    .map((p, i) => {
      const without = buildModel(priced.filter((_, j) => j !== i), zone);
      const off = Math.abs(zoneDamage(p.tntKg, without) - p.damage);
      return { ...p, off, error: off / p.damage };
    })
    .sort((a, b) => a.error - b.error);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const heaviest = priced.reduce((max, p) => Math.max(max, p.tntKg), 0);
  console.log(
    `\nBase-damage model: ${model.points.length} corners read off ${priced.length} priced blasts, ` +
      `zone armour ${model.armorThickness} mm (×${model.restrain} below); ${held}/${priced.length} reproduced to the point`,
  );
  const worst = errors.slice(-3).reverse();
  console.log(
    `  each left out in turn: off by ${pct(errors[Math.floor(errors.length / 2)]?.error ?? 0)} median, worst ` +
      worst.map((w) => `${w.file} ${pct(w.error)} (${w.off} pt)`).join(", "),
  );
  const estimated = rounds.filter((r) => r.damageSource === "estimate");
  const heat = estimated.filter((r) => r.stats.warhead === "heat" || r.stats.warhead === "tandem").length;
  const beyond = estimated.filter((r) => (r.tntKg ?? 0) > heaviest).length;
  console.log(
    `  estimated for ${estimated.length} rounds the game does not price` +
      (heat > 0 ? `; ${heat} shaped charges, on their blast alone` : "") +
      (beyond > 0 ? `; ${beyond} heavier than any it prices (${Math.round(heaviest)} kg TNT), carried on past it` : ""),
  );
}

// `index.ts` imports `isPhysicalCount` from here, and an import must not pull
// the whole catalogue down as a side effect — it would race the payload step
// that reads the result. Only run when this file is the one that was invoked.
if (process.argv[1] && /[\\/]stores\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
