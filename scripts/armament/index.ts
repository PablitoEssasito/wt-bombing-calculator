import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeArmament, type CompactArmament } from "../../src/domain/armament-data";
import { effectiveBaseHp } from "../../src/domain/base-hp";
import { BASE_BLEED, NATIONS, type BaseHp, type Nation } from "../../src/domain/constants";
import { fitsSetup, nearestCarried, nearestSetup, splitIntoBases, type Rounds, type Split } from "../../src/domain/fit";
import type { Aircraft, Bomb, LoadoutItem, LoadoutOption, Schedule } from "../../src/domain/types";
import { carriedWithin, variantOf } from "../../src/domain/loadout";
import { shortfallOf } from "../../src/domain/schedule";
import { downloadIcons } from "../bomb-icons/fetch";
import { loadWpcost } from "../shared/wpcost";
import { parseArmament, presetPath, type Armament } from "./parse";
import { rebindPlans } from "./rebind";
import { nationOfCountry, reconcile, sheetView } from "./reconcile";
import type { Category } from "./stats";
import { isPhysicalCount, type Round } from "./stores";

const RAW =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/aces.vromfs.bin_u/gamedata";

const DATA_DIR = path.join(process.cwd(), "src", "data");
/** Shipped: the one field the app reads at runtime. */
const OUT_MOUNTS = path.join(DATA_DIR, "mounts.json");
/**
 * The game's own files, kept as they came.
 *
 * Caching the parse instead was a false economy: every correction to the parser
 * meant pulling six hundred files again, which is exactly when you least want to.
 */
const RAW_DIR = path.join(process.cwd(), ".cache", "armament", "raw");
/** Reference material for auditing, deliberately out of the bundle. */
const OUT_FULL = path.join(process.cwd(), ".cache", "armament", "armament.json");
/** The store catalogue `npm run stores` builds, which this joins against. */
const STORES_FILE = path.join(process.cwd(), ".cache", "armament", "stores.json");
/** Shipped: what the loadout creator reads, one aircraft at a time. */
const OUT_ARMAMENT = path.join(DATA_DIR, "armament.json");
/** Build-time only: which aircraft the game lets carry each bomb, for the bomb pages. */
const OUT_CARRIERS = path.join(DATA_DIR, "carriers.json");
/** Build-time only: the game's aircraft outside the site that carry each one, by unit. */
const OUT_OTHER_CARRIERS = path.join(DATA_DIR, "other-carriers.json");
/** Build-time only: each row's figures as the game's weapon tooltip shows them. */
const OUT_STATS = path.join(DATA_DIR, "armament-stats.json");
/** One entry per round of ordnance, from `npm run stores`. */
const ROUNDS_FILE = path.join(process.cwd(), ".cache", "armament", "rounds.json");

type StoreRecord = {
  file: string;
  name: string | null;
  short: string | null;
  massKg: number | null;
  kind: string;
  bomb: { id: string; count: number } | null;
  holds: number;
  iconType: string | null;
  category: Category | null;
  guidance: string | null;
  damage: number | null;
  container: boolean;
};

/**
 * What a hardpoint choice is priced by in the loadout creator: ordnance meant
 * for the ground. An air-to-air missile or a gun pod has its own row in the
 * armament table, but hangs in a build as nothing to price.
 */
const PRICED: ReadonlySet<Category> = new Set(["bomb", "guidedBomb", "rocket", "agm", "torpedo", "mine"]);

const CONCURRENCY = 8;

const useCache = process.argv.includes("--cache");

type UnitFiles = { fm: Record<string, unknown>; presets: Record<string, Record<string, unknown>> };

async function getJson(relativePath: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${RAW}/${relativePath}`);
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadUnit(unitId: string): Promise<UnitFiles | null> {
  const cachePath = path.join(RAW_DIR, `${unitId}.json`);
  if (useCache && existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, "utf8")) as UnitFiles;
  }

  const fm = await getJson(`flightmodels/${unitId}.blkx`);
  if (!fm) return null;

  // Each preset's composition lives in its own small file beside the flight model.
  const references = (fm.weapon_presets as { preset?: unknown } | undefined)?.preset;
  const list = (Array.isArray(references) ? references : references ? [references] : []) as {
    name: string;
    blk: string;
  }[];

  const presets: Record<string, Record<string, unknown>> = {};
  await Promise.all(
    list.map(async (entry) => {
      const body = await getJson(presetPath(entry.blk));
      if (body) presets[String(entry.name)] = body;
    }),
  );

  const files: UnitFiles = { fm, presets };
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(files), "utf8");
  return files;
}

async function main() {
  const aircraft = (JSON.parse(await readFile(path.join(DATA_DIR, "aircraft.json"), "utf8")) as Aircraft[]).map(
    withSheetPlans,
  );
  const unitIds = JSON.parse(
    await readFile(path.join(DATA_DIR, "images.json"), "utf8"),
  ) as Record<string, string>;

  const wanted = [...new Set(aircraft.map((p) => unitIds[p.id]).filter(Boolean))];
  console.log(
    useCache
      ? `Reading ${wanted.length} flight models, cached where already pulled`
      : `Pulling ${wanted.length} flight models from the datamine`,
  );

  const byUnit: Record<string, Armament> = {};
  const missing: string[] = [];
  const queue = [...wanted];
  let done = 0;

  async function worker() {
    for (let unitId = queue.shift(); unitId; unitId = queue.shift()) {
      const files = await loadUnit(unitId);
      if (files) {
        byUnit[unitId] = parseArmament(files.fm, new Map(Object.entries(files.presets)));
      } else {
        missing.push(unitId);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${wanted.length} read...`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Aircraft outside the site whose fixed setups the price list does not break
  // down: their flight models are the only record of what those setups hang,
  // so the store catalogue reads them too. Pulled, never parsed into anything
  // shipped — the site has no page for them.
  const siteUnits = new Set(wanted);
  const unlisted = (await loadWpcost(useCache)).unlisted.filter((unit) => !siteUnits.has(unit));
  const unlistedMissing: string[] = [];
  const extraQueue = [...unlisted];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let unitId = extraQueue.shift(); unitId; unitId = extraQueue.shift()) {
        if (!(await loadUnit(unitId))) unlistedMissing.push(unitId);
      }
    }),
  );
  console.log(
    `Read ${unlisted.length - unlistedMissing.length} more flight models for the armament catalogue, ` +
      `aircraft whose fixed setups only their flight model lists` +
      (unlistedMissing.length > 0 ? ` (${unlistedMissing.length} missing)` : ""),
  );

  // stores.ts builds its catalogue from these flight models, and this script
  // reads that catalogue — so a fresh import pulls them first, stops, runs
  // stores, then comes back with --cache.
  if (process.argv.includes("--fetch-only")) {
    console.log(`Pulled ${Object.keys(byUnit).length} flight models, ${missing.length} missing`);
    return;
  }

  const mounts: Record<string, "pylons" | "setups"> = {};
  for (const plane of aircraft) {
    const armament = byUnit[unitIds[plane.id]];
    if (armament) mounts[plane.id] = armament.style;
  }

  await mkdir(path.dirname(OUT_FULL), { recursive: true });
  await writeFile(OUT_FULL, JSON.stringify(byUnit), "utf8");
  await writeFile(OUT_MOUNTS, JSON.stringify(mounts), "utf8");

  // The sheet's own rows as the sheet printed them: the last import's rows
  // from the game alone, and what it overruled, are made again from scratch.
  const sheetRows = (JSON.parse(await readFile(path.join(DATA_DIR, "bombs.json"), "utf8")) as Bomb[])
    .filter((bomb) => bomb.source !== "game")
    .map(sheetView);
  await writePayload(byUnit);
  const catalogue = JSON.parse(await readFile(STORES_FILE, "utf8")) as StoreRecord[];
  report(aircraft, unitIds, byUnit, missing, catalogue);

  const rounds = JSON.parse(await readFile(ROUNDS_FILE, "utf8")) as Round[];
  const wpcost = await loadWpcost(true);
  const { rows: bombs, stats, changes, unmatched: noFile, estimates, aliased, types } = reconcile(
    sheetRows,
    rounds,
    (unit) => wpcost.units[unit]?.country,
  );
  reportReconciled(bombs, changes, noFile, estimates, aliased, types);
  await writeFile(OUT_STATS, JSON.stringify(stats), "utf8");

  const carriers = sharedAcrossDuplicates(gameCarriersOf(aircraft, unitIds, byUnit, catalogue), bombs);
  await writeFile(
    OUT_CARRIERS,
    // Keys in order: the map fills in whatever order the files came in.
    JSON.stringify(
      Object.fromEntries(
        [...carriers].sort(([a], [b]) => a.localeCompare(b)).map(([bombId, planes]) => [bombId, [...planes].sort()]),
      ),
    ),
    "utf8",
  );
  // The game's aircraft the site has no page for, by the price list's unit name.
  const others = new Map<string, Set<string>>();
  for (const round of rounds) {
    if (!round.bombId) continue;
    const set = others.get(round.bombId) ?? new Set<string>();
    for (const unit of round.units) if (!siteUnits.has(unit)) set.add(unit);
    others.set(round.bombId, set);
  }
  await writeFile(
    OUT_OTHER_CARRIERS,
    JSON.stringify(
      Object.fromEntries(
        [...others]
          .filter(([, units]) => units.size > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, units]) => [id, [...units].sort()]),
      ),
    ),
    "utf8",
  );

  // The sheet's plans with the bombs the game lets each aircraft hang.
  const planesCarrying = new Map<string, Set<string>>();
  for (const [bombId, planes] of carriers) {
    for (const plane of planes) planesCarrying.set(plane, (planesCarrying.get(plane) ?? new Set()).add(bombId));
  }
  const { aircraft: reboundPlans, changes: rebound } = rebindPlans(aircraft, bombs, (plane) => planesCarrying.get(plane));
  console.log(
    rebound.length === 0
      ? "ok    every bomb in the sheet's plans is one its aircraft hangs in the game"
      : `note  ${rebound.length} bomb(s) in the sheet's plans swapped for what the aircraft hangs in the game:`,
  );
  for (const line of rebound) console.log(`        ${line}`);
  const plans = fitPlans(
    reboundPlans,
    unitIds,
    byUnit,
    catalogue,
    new Map(bombs.map((bomb) => [bomb.id, bomb])),
    JSON.parse(await readFile(OUT_ARMAMENT, "utf8")) as CompactArmament,
    wpcost.presets,
  );
  await writeFile(path.join(DATA_DIR, "aircraft.json"), JSON.stringify(plans), "utf8");

  const countriesOf = new Map<string, Nation[]>();
  for (const round of rounds) {
    if (!round.bombId) continue;
    const nations = round.units.flatMap((unit) => nationOfCountry(wpcost.units[unit]?.country) ?? []);
    countriesOf.set(round.bombId, [...(countriesOf.get(round.bombId) ?? []), ...nations]);
  }
  const usedBy = usedByNationsOf(plans, carriers, bombs, countriesOf);
  const enrichedBombs = bombs.map((bomb) => ({ ...bomb, usedByNations: usedBy.get(bomb.id) ?? [] }));
  await writeFile(path.join(DATA_DIR, "bombs.json"), JSON.stringify(enrichedBombs), "utf8");
  const bombsById = new Map(enrichedBombs.map((bomb) => [bomb.id, bomb]));
  reportShortfalls(plans, bombsById);
  weighLoadouts(plans, unitIds, byUnit, enrichedBombs);
  const unmatched = enrichedBombs.filter((b) => b.usedByNations.length === 0);
  console.log(
    `\nNation usage: ${enrichedBombs.length - unmatched.length}/${enrichedBombs.length} bombs matched ` +
      `to at least one nation` +
      (unmatched.length > 0
        ? `; ${unmatched.length} matched none, so only "All nations" shows them: ` +
          unmatched
            .slice(0, 8)
            .map((b) => b.chartName || b.fullName)
            .join(", ")
        : ""),
  );

  // Every icon a missile, a gun or anything else states directly — the bomb
  // chart's own icons come from a separate match in scripts/bomb-icons, keyed
  // by bomb id rather than icon type, so this only ever pulls what that step
  // would not already have. Presets first: a preset's own iconType is what the
  // loadout menu actually draws (see SlotOption.iconType in parse.ts), so its
  // key needs fetching even where the store catalogue's own key already exists.
  const presetIconTypes = Object.values(byUnit).flatMap((a) =>
    a.slots.flatMap((s) => s.options.flatMap((o) => (o.iconType ? [o.iconType] : []))),
  );
  const iconTypes = [
    ...new Set([...presetIconTypes, ...catalogue.flatMap((s) => (s.iconType ? [s.iconType] : []))]),
  ].sort();
  console.log(`\nDownloading ${iconTypes.length} distinct icons the armament catalogue names directly...`);
  const { downloaded, failed } = await downloadIcons(iconTypes);
  console.log(`Icons ready (${downloaded} newly downloaded, ${failed.length} failed)`);
  if (failed.length > 0) console.log(`  ${failed.slice(0, 10).join(", ")}`);
}

/**
 * Which aircraft the game's own files let carry each bomb, by aircraft id.
 *
 * Both ways an aircraft is armed count: its hardpoints, resolved through the
 * store catalogue the same way `writePayload` resolves them, and its
 * ready-made setups — all a bomber like the Pe-8 has, and the only place its
 * FAB-5000 is named. A setup naming a per-slot preset rather than a weapon
 * file is already covered by the hardpoint it comes from.
 */
function gameCarriersOf(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  catalogue: StoreRecord[],
): Map<string, Set<string>> {
  const byFile = new Map(catalogue.map((s) => [s.file, s]));
  const planesByUnit = new Map<string, string[]>();
  for (const plane of aircraft) {
    const unitId = unitIds[plane.id];
    if (unitId) planesByUnit.set(unitId, [...(planesByUnit.get(unitId) ?? []), plane.id]);
  }

  const carriers = new Map<string, Set<string>>();
  for (const [unitId, armament] of Object.entries(byUnit)) {
    const planes = planesByUnit.get(unitId) ?? [];
    const files = [
      ...armament.slots.flatMap((slot) => slot.options.flatMap((option) => option.stores.map((s) => s.file))),
      ...armament.presets.flatMap((preset) => preset.weapons.map((w) => w.weapon)),
    ];
    for (const file of files) {
      const bombId = byFile.get(file)?.bomb?.id;
      if (!bombId) continue;
      const set = carriers.get(bombId) ?? new Set<string>();
      for (const plane of planes) set.add(plane);
      carriers.set(bombId, set);
    }
  }
  return carriers;
}

/**
 * The same carriers for chart rows that are one weapon listed twice.
 *
 * A store prices as one row, but the chart can hold another for the same
 * thing: "Type 23 SNEB rockets" twice over under different short names, or
 * "Paveway II (Mk.18)" beside "Mk.18" itself — the bracket naming the other
 * row. Either way, what carries one carries the other; kinds must agree, or
 * the plain and retarded "120 kg m/71" would merge. A shared name alone is
 * not enough: the chart's two "1000 lb G.P. Mk.I" rows are its early and late
 * marks, priced apart, so a repeated name must repeat the figures too.
 */
function sharedAcrossDuplicates(carriers: Map<string, Set<string>>, bombs: Bomb[]): Map<string, Set<string>> {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const groups = new Map<string, string[]>();
  const join = (a: Bomb, b: Bomb) => {
    const merged = [...new Set([...(groups.get(a.id) ?? [a.id]), ...(groups.get(b.id) ?? [b.id])])];
    for (const id of merged) groups.set(id, merged);
  };
  for (const a of bombs) {
    const inBrackets = [...a.fullName.matchAll(/\((.*?)\)/g)].map((m) => norm(m[1]));
    for (const b of bombs) {
      if (a.id === b.id || a.kind !== b.kind) continue;
      const namesB = [b.fullName, b.chartName].filter(Boolean).map(norm);
      const twice =
        norm(a.fullName) === norm(b.fullName) && a.massKg === b.massKg && a.damageValue === b.damageValue;
      if (twice || inBrackets.some((name) => namesB.includes(name))) join(a, b);
    }
  }

  const shared = new Map(carriers);
  for (const [id, members] of groups) {
    const union = new Set(members.flatMap((member) => [...(carriers.get(member) ?? [])]));
    if (union.size > 0) shared.set(id, union);
  }
  return shared;
}

/**
 * The sheet's own plans that count a base down which the game's damage figures
 * leave standing — the planner marks each on its tile; listed here so an import
 * that makes a new one is noticed.
 */
function reportShortfalls(aircraft: Aircraft[], bombs: Map<string, Bomb>) {
  const lines: string[] = [];
  for (const plane of aircraft) {
    for (const [index, option] of plane.options.entries()) {
      for (const schedule of option.schedules) {
        for (const short of shortfallOf(schedule, bombs)) {
          const what = short.needed
            ? `${short.needed.sheetCount} × ${short.needed.bomb.chartName || short.needed.bomb.fullName}, the game's figures need ${short.needed.count}`
            : `${Math.round(short.damage)} of ${Math.round(short.threshold)} (the sheet's figures: ${Math.round(short.sheetDamage)})`;
          lines.push(`${plane.name} loadout ${index + 1} at ${schedule.baseHp} HP, base ${short.base + 1}: ${what}`);
        }
      }
    }
  }
  if (lines.length === 0) {
    console.log("ok    every base the sheet's plans count down falls to the game's damage figures too");
    return;
  }
  console.log(`warn  ${lines.length} base(s) the sheet's plans count down stand by the game's damage figures:`);
  for (const line of lines) console.log(`        ${line}`);
}

/** What the game's files changed about the sheet's rows, and what they added. */
function reportReconciled(
  rows: Bomb[],
  changes: string[],
  noFile: string[],
  estimates: string[],
  aliased: string[],
  types: string[],
) {
  const game = rows.filter((row) => row.source === "game");
  const bySource = (source: string) => rows.filter((row) => row.damageSource === source).length;
  console.log(`\n--- armament table ---`);
  console.log(`ok    ${rows.length} rows: ${rows.length - game.length} from the sheet, ${game.length} from the game alone`);
  console.log(
    `      damage to bases: ${bySource("game")} the game's own, ${bySource("estimate")} estimated from its ` +
      `explosion model, ${rows.filter((row) => row.damageValue === null).length} with none`,
  );
  const damage = changes.filter((line) => line.includes(": damageValue "));
  console.log(`      ${changes.length} figure(s) the game overrules, ${damage.length} of them damage to bases:`);
  for (const line of damage) console.log(`        ${line}`);
  if (changes.length > damage.length) {
    console.log(`      (${changes.length - damage.length} mass, TNT and kind changes, in full with --verbose)`);
    if (process.argv.includes("--verbose")) for (const line of changes) if (!damage.includes(line)) console.log(`        ${line}`);
  }
  if (noFile.length > 0) {
    console.log(`note  ${noFile.length} sheet row(s) tie to no file in the game: ${noFile.join(", ")}`);
  }
  if (aliased.length > 0) {
    console.log(`note  ${aliased.length} of them take the figures of the game's weapon by the same name:`);
    for (const line of aliased) console.log(`        ${line}`);
  }
  if (estimates.length > 0) {
    console.log(`note  ${estimates.length} sheet figure(s) the explosion model puts otherwise, the estimate taken:`);
    for (const line of estimates) console.log(`        ${line}`);
  }
  if (types.length > 0) {
    console.log(`note  ${types.length} sheet bomb(s) the game's file makes another type, filtered by the game's:`);
    for (const line of types) console.log(`        ${line}`);
  }
}

/**
 * Which nations actually carry each bomb, from two sources unioned together.
 *
 * The Bomb Chart's own `nation` column names whichever nation's block a bomb
 * was first catalogued under — not an exhaustive list of who can carry it.
 * Neither source below is enough by itself:
 *
 * - The sheet's own bombing schedules (`aircraft[].options[].schedules`) never
 *   mention a rocket at all — LEGION's Loadouts only prices bombs (see
 *   scripts/etl/rockets.ts), so rockets carry no schedule entries whatsoever.
 * - The game's own files (`gameCarriersOf`) reach rockets, but only for
 *   aircraft the datamine actually files armament for.
 *
 * Unioning both catches a bomb the moment either one has seen it carried.
 * Falls back to the chart's own `nation` only when a bomb turns up in
 * neither — so nothing the chart named a nation for goes unfilterable, while
 * everything with real usage data gets the fuller, more accurate picture
 * (rockets, and ordinary bombs shared across nations through lend-lease or
 * licence-built aircraft, that column was never able to state).
 */
function usedByNationsOf(
  aircraft: Aircraft[],
  carriers: Map<string, Set<string>>,
  bombs: Bomb[],
  countriesOf: Map<string, Nation[]>,
): Map<string, Nation[]> {
  const nationOf = new Map(aircraft.map((plane) => [plane.id, plane.nation]));
  const sets = new Map<string, Set<Nation>>();
  const add = (bombId: string, nation: Nation) => {
    const set = sets.get(bombId) ?? new Set<Nation>();
    set.add(nation);
    sets.set(bombId, set);
  };

  for (const plane of aircraft) {
    for (const option of plane.options) {
      for (const schedule of option.schedules) {
        for (const base of schedule.bases) {
          for (const item of base.items) add(item.bombId, plane.nation);
        }
      }
    }
  }
  for (const [bombId, planes] of carriers) {
    for (const plane of planes) add(bombId, nationOf.get(plane)!);
  }
  // Every aircraft in the game, not only the site's: the price list says who carries it.
  for (const [bombId, nations] of countriesOf) {
    for (const nation of nations) add(bombId, nation);
  }

  return new Map(
    bombs.map((bomb) => {
      const found = sets.get(bomb.id);
      // Ordered to match NATIONS, not insertion order, so the field reads the
      // same way the nation chips are laid out.
      const nations = found ? NATIONS.filter((n) => found.has(n)) : bomb.nation ? [bomb.nation] : [];
      return [bomb.id, nations];
    }),
  );
}

/**
 * Writes what the loadout creator needs, for the aircraft that can use it.
 *
 * Only aircraft with hardpoints get an entry — there is nothing to build on a
 * Pe-8. It ships as one file but is never handed to the browser whole: the
 * aircraft page picks out its own unit and passes that slice down as props.
 *
 * Stores are listed once in `files` and referred to by index everywhere else.
 * Twenty-three thousand hardpoint options naming `us_500lb_anm64a1` in full is
 * most of a megabyte spent writing the same eighteen characters over and over.
 */
async function writePayload(byUnit: Record<string, Armament>) {
  const catalogue = JSON.parse(await readFile(STORES_FILE, "utf8")) as StoreRecord[];
  const byFile = new Map(catalogue.map((s) => [s.file, s]));

  const files: string[] = [];
  const indexOf = new Map<string, number>();
  const intern = (file: string) => {
    const known = indexOf.get(file);
    if (known !== undefined) return known;
    indexOf.set(file, files.length);
    files.push(file);
    return files.length - 1;
  };

  /**
   * How many of a store a hardpoint choice actually hangs.
   *
   * The game states this two ways and only one of them is safe to read without
   * knowing what is on the other end. Separate mounting points are always a
   * physical count — a Tu-95M's bomb bay is six entries of one FAB-250 each. The
   * `bullets` field beside a reference is a physical count only on a rack or a
   * rail, and ammunition on anything else, which is why a BK-27 states 150 of
   * itself. So repeats are counted for ordinary stores, and `bullets` is taken
   * only where a container is doing the holding.
   */
  let ammoIgnored = 0;
  const countOf = (store: { file: string; entries: number; bullets: number }): number => {
    const known = byFile.get(store.file);
    if (known && isPhysicalCount(known)) return store.bullets;
    if (store.bullets > store.entries) ammoIgnored++;
    return store.entries;
  };

  /**
   * The choices a hardpoint offers, with any name it states twice kept once.
   *
   * A dozen slots across the roster list the same preset name twice — the
   * Alpha Jet's `lau_51`, the Netz's `ptb_slot4`, the MiG-27M's `zb_500` —
   * always with identical contents, so the game is repeating itself rather
   * than offering two different things. Nothing downstream could tell them
   * apart even if it were: a build is a map of slot to preset name, so the
   * name *is* the address of a choice, and a second entry under it can neither
   * be selected nor shown as selected. Dropping it here keeps that model
   * honest instead of shipping a row that looks pickable and is not.
   */
  let duplicateOptions = 0;
  const distinct = <T extends { name: string; hidden: boolean }>(options: T[]): T[] => {
    const seen = new Set<string>();
    return options.filter((option) => {
      if (option.hidden) return false;
      if (seen.has(option.name)) {
        duplicateOptions++;
        return false;
      }
      seen.add(option.name);
      return true;
    });
  };

  // Intern every store up front, sorted, so the file reads the same on every
  // run — the flight models arrive in whatever order the fetch finished, and
  // interning on first sight made each regeneration a spurious 1.3 MB diff.
  const referenced = new Set<string>();
  for (const armament of Object.values(byUnit)) {
    if (armament.style !== "pylons") continue;
    for (const slot of armament.slots) {
      for (const option of slot.options) {
        if (option.hidden) continue;
        for (const store of option.stores) referenced.add(store.file);
      }
    }
  }
  for (const file of [...referenced].sort()) intern(file);

  const units: Record<string, unknown> = {};
  const unitsInOrder = Object.entries(byUnit).sort(([a], [b]) => a.localeCompare(b));
  for (const [unitId, armament] of unitsInOrder) {
    if (armament.style !== "pylons") continue;

    // A dependency rule is only useful if both ends name a choice this aircraft
    // actually offers — 5.5% do not, being copy-paste in the source (see the
    // audit above), and there is nothing to warn about pointing at nothing.
    const offered = new Map(armament.slots.map((s) => [s.index, new Set(s.options.map((o) => o.name))]));
    const resolves = (slot: number, preset: string) => offered.get(slot)?.has(preset) ?? false;
    const requires = armament.requires.filter(
      (r) => resolves(r.slot, r.preset) && resolves(r.otherSlot, r.otherPreset),
    );

    units[unitId] = {
      max: armament.maxLoadKg,
      left: armament.maxLeftKg,
      right: armament.maxRightKg,
      diff: armament.maxDisbalanceKg,
      slots: armament.slots.map((slot) => ({
        i: slot.index,
        o: distinct(slot.options).map((option) => {
            const resolved = option.stores.map((store) => ({
              file: store.file,
              count: countOf(store),
            }));
            return {
              n: option.name,
              // One store carried once is the ordinary case, and writes as a bare index.
              w:
                resolved.length === 1 && resolved[0].count === 1
                  ? intern(resolved[0].file)
                  : resolved.map((store) => [intern(store.file), store.count]),
              // The preset's own icon, when it states one — see SlotOption.iconType
              // in scripts/armament/parse.ts for why this outranks a store's own.
              ...(option.iconType ? { i: option.iconType } : {}),
              ...(option.machLimit !== null ? { m: option.machLimit } : {}),
            };
          }),
      })),
      bans: armament.bans.map((r) => [r.slot, r.preset, r.otherSlot, r.otherPreset]),
      reqs: requires.map((r) => [r.slot, r.preset, r.otherSlot, r.otherPreset]),
    };
  }

  const stores = files.map((file) => {
    const store = byFile.get(file);
    if (!store) return { n: file, s: null, kg: null, k: "other" };
    return {
      n: store.name,
      s: store.short,
      // The game's own figures carry float noise; nothing needs it to the microgram.
      kg: store.massKg === null ? null : Math.round(store.massKg * 100) / 100,
      k: store.kind,
      ...(store.bomb && store.category && PRICED.has(store.category) ? { b: [store.bomb.id, store.bomb.count] } : {}),
      // One round is the ordinary case and is left implicit.
      ...(store.holds > 1 ? { h: store.holds } : {}),
      ...(store.iconType ? { i: store.iconType } : {}),
    };
  });

  const payload = { files, stores, units };
  await writeFile(OUT_ARMAMENT, JSON.stringify(payload), "utf8");
  console.log(
    `      wrote ${Object.keys(units).length} buildable aircraft and ${files.length} stores ` +
      `to src/data/armament.json (${Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024)} KB)`,
  );
  if (duplicateOptions > 0) {
    console.log(
      `      dropped ${duplicateOptions} hardpoint choice(s) repeating a name already ` +
        `offered on the same pylon — one choice, stated twice`,
    );
  }
  if (ammoIgnored > 0) {
    console.log(
      `      ignored an ammunition figure on ${ammoIgnored} hardpoint choice(s) — a cannon's ` +
        `magazine, not that many gun pods`,
    );
  }
  namedCounts(units, stores);
}

function report(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  missing: string[],
  catalogue: StoreRecord[],
) {
  const units = Object.values(byUnit);
  const read = aircraft.filter((p) => byUnit[unitIds[p.id]]).length;
  const pylons = units.filter((u) => u.style === "pylons").length;
  const sum = (pick: (u: Armament) => number) => units.reduce((n, u) => n + pick(u), 0);

  console.log(`\n--- armament ---`);
  console.log(`ok    ${read}/${aircraft.length} aircraft, from ${units.length} distinct units`);
  console.log(`      ${pylons} mount per pylon, ${units.length - pylons} offer fixed setups only`);
  console.log(`      ${sum((u) => u.presets.length)} ready-made loadouts`);
  console.log(
    `      ${sum((u) => u.bans.length)} exclusion and ${sum((u) => u.requires.length)} ` +
      `dependency rule(s)`,
  );

  const lopsided = units.filter(
    (u) => u.maxLeftKg !== null && u.maxLeftKg !== u.maxRightKg,
  ).length;
  console.log(`      ${lopsided} state different limits for the left and right wing`);

  const hidden = sum((u) => u.slots.reduce((n, s) => n + s.options.filter((o) => o.hidden).length, 0));
  console.log(`      ${hidden} hardpoint choice(s) the loadout menu does not show`);

  audit(byUnit);
  auditPresets(byUnit, catalogue);

  if (missing.length > 0) {
    console.log(`warn  ${missing.length} unit(s) had no flight model: ${missing.slice(0, 6).join(", ")}`);
  }
  const unmatched = aircraft.filter((p) => !unitIds[p.id]).map((p) => p.name);
  if (unmatched.length > 0) {
    console.log(`warn  ${unmatched.length} aircraft have no unit to look up: ${unmatched.join(", ")}`);
  }
}

/**
 * Weighs each loadout the spreadsheet prescribes against what the airframe lifts.
 *
 * This is the one place two independent sources describe the same thing: the
 * sheet says how many of each bomb to hang, and the game's own files say what
 * each bomb weighs and how much the aircraft may carry. A loadout heavier than
 * the limit is not a loadout anyone can take, whatever the sheet says — with
 * the caveat `auditPresets` prints: four of the game's own presets sit over
 * their airframe's figure too, so the ceiling is not quite the hard wall it
 * looks like.
 *
 * Read off the plans as they stand once the game's bombs are in them, at the
 * game's own masses — the bombs alone, so a rack's own weight and the spare
 * rounds it forces are not in it. dataset.test.ts holds every plan to the
 * hardpoints themselves; this is the first look an import gives.
 */
function weighLoadouts(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  bombs: Bomb[],
) {
  const massOf = new Map(bombs.map((b) => [b.id, b.massKg]));

  let checked = 0;
  const over: { plane: Aircraft; option: number; mass: number; limit: number }[] = [];

  for (const plane of aircraft) {
    const limit = byUnit[unitIds[plane.id]]?.maxLoadKg;
    if (!limit) continue;

    plane.options.forEach((option, index) => {
      let heaviest = 0;
      for (const schedule of option.schedules) {
        let mass = 0;
        for (const base of schedule.bases) {
          for (const item of base.items) {
            const kg = massOf.get(item.bombId);
            // Something with no mass — a row the game has no file for — would understate it.
            if (kg === null || kg === undefined) return;
            mass += kg * item.count;
          }
        }
        heaviest = Math.max(heaviest, mass);
      }
      if (heaviest === 0) return;
      checked++;
      if (heaviest > limit) {
        over.push({ plane, option: index + 1, mass: heaviest, limit });
      }
    });
  }

  console.log(
    `${over.length === 0 ? "ok   " : "warn "} ${over.length}/${checked} loadout(s) weigh more ` +
      "than the aircraft can carry:",
  );
  for (const o of over.sort((a, b) => b.mass / b.limit - a.mass / a.limit)) {
    console.log(
      `        ${o.plane.nation}/${o.plane.name} loadout ${o.option}: ${Math.round(o.mass)} kg ` +
        `against a ${o.limit} kg limit (${Math.round((100 * o.mass) / o.limit)}%)`,
    );
  }
}

/**
 * A plane with the sheet's own plans back where the last import put others in
 * their place (`fitPlans`), and none of its marks or the setups it added:
 * every import starts again from the sheet's.
 */
function withSheetPlans(plane: Aircraft): Aircraft {
  return {
    ...plane,
    options: plane.options.filter((option) => !option.gameSetup).map((option) => ({
      ...option,
      schedules: option.schedules.map((schedule) => {
        const sheet: Schedule = schedule.sheetPlan ? { ...schedule, ...schedule.sheetPlan } : { ...schedule };
        delete sheet.sheetPlan;
        delete sheet.noSetup;
        return sheet;
      }),
    })),
  };
}

/**
 * Holds each of the sheet's schedules to what its aircraft can carry, and puts
 * the nearest one it can in place of one it cannot (see src/domain/fit.ts) —
 * the sheet's own kept in `sheetPlan`, which the next import starts from again.
 *
 * With pylons, the plan has to hang within the load limit, the game's
 * exclusions kept, spare rounds allowed as the racks force them — the planner's
 * own test of it. In its place goes the part of it the hardpoints take exactly
 * that brings down the most bases, then gives up the least damage. With fixed
 * setups, one of them has to hang every bomb of it (`fitsSetup`); in its place
 * goes the setup that brings down the most bases, then comes nearest it in
 * damage — only a setup whose rounds the game's own price for it bears out to
 * the unit (`presetPrices`, from wpcost.blkx), so a misread count never makes
 * a plan. Bases are counted by the game's figures, never more than the sheet
 * counts. Where nothing can be put in its place, the plan stays and the planner
 * says it can't be hung (`Schedule.noSetup` for setups).
 */
function fitPlans(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  catalogue: StoreRecord[],
  bombs: Map<string, Bomb>,
  hardpoints: CompactArmament,
  presetPrices: Record<string, Record<string, number>>,
): Aircraft[] {
  const byFile = new Map(catalogue.map((store) => [store.file, store]));
  const nameOf = (bombId: string) => {
    const bomb = bombs.get(bombId);
    return bomb ? bomb.chartName || bomb.fullName : bombId;
  };
  const text = (load: readonly Rounds[]) => {
    const totals = new Map<string, number>();
    for (const { bombId, count } of load) totals.set(bombId, (totals.get(bombId) ?? 0) + count);
    return [...totals].map(([bombId, count]) => `${count} × ${nameOf(bombId)}`).join(", ");
  };
  const damageOf = (bombId: string) => bombs.get(bombId)?.damageValue ?? 0;
  const damageOfLoad = (load: readonly Rounds[]) => load.reduce((sum, r) => sum + damageOf(r.bombId) * r.count, 0);
  const unverified = new Set<string>();
  const standsIn = (bombId: string, forBombId: string) => {
    const bomb = bombs.get(bombId);
    const of = bombs.get(forBombId);
    return bomb !== undefined && of !== undefined && variantOf(bomb, of);
  };
  const thresholdOf = (baseHp: BaseHp) => effectiveBaseHp(baseHp, "rb", 4) * BASE_BLEED;
  // A split as a schedule writes it: the bases counted, then what is left over on one more.
  const placed = (split: Split, item: (rounds: Rounds) => LoadoutItem = (rounds) => ({ ...rounds })) => ({
    bases: [...split.bases, ...(split.leftover.length > 0 ? [split.leftover] : [])].map((rounds) => ({
      items: rounds.map(item),
    })),
    basesDestroyed: split.bases.length,
  });
  let checked = 0;
  const fitted: string[] = [];
  const unfit: string[] = [];
  const offered: string[] = [];

  const out = aircraft.map((plane) => {
    // Setups as good as the one put in a plan's place, to offer beside it: by loadout.
    const beside: { index: number; load: Rounds[] }[] = [];
    const unitId = unitIds[plane.id] ?? "";
    const style = byUnit[unitId]?.style;
    const armament = style === "pylons" ? decodeArmament(hardpoints, unitId, () => null) : null;
    const setups =
      style === "setups"
        ? byUnit[unitId].presets.map((preset) => ({
            name: preset.name,
            rounds: preset.weapons.flatMap(({ weapon, count }): Rounds[] => {
              const bomb = byFile.get(weapon)?.bomb;
              return bomb ? [{ bombId: bomb.id, count: bomb.count * count }] : [];
            }),
          }))
        : null;
    // What may go in a plan's place: a setup the game prices at exactly what its rounds come to.
    const priced = (setups ?? []).filter(({ name, rounds }) => {
      if (rounds.length === 0) return false;
      const price = presetPrices[unitId]?.[name];
      const bears = price !== undefined && Math.abs(damageOfLoad(rounds) - price) < 0.5;
      if (!bears) unverified.add(`${plane.name}: ${name}`);
      return bears;
    });

    const options = plane.options.map((option, index) => ({
      ...option,
      schedules: option.schedules.map((sheet): Schedule => {
        if (!armament && !setups) return sheet;
        // Bases the sheet counts without writing their bombs: nothing to hold up.
        if ((sheet.basesDestroyed ?? 0) > sheet.bases.length) return sheet;

        const items = sheet.bases.flatMap((base) => base.items);
        const load = items.map(({ bombId, count }) => ({ bombId, count }));
        checked++;
        const carried = armament
          ? carriedWithin(armament, load, standsIn, false) !== null
          : setups!.some((setup) => fitsSetup(setup.rounds, load, standsIn));
        if (carried) return sheet;

        const threshold = thresholdOf(sheet.baseHp);
        const cap = sheet.basesDestroyed ?? Infinity;
        const bySetup = armament
          ? null
          : nearestSetup(
              priced.map((setup) => setup.rounds),
              load,
              damageOf,
              threshold,
              cap,
            );
        const fit = armament ? nearestCarried(armament, load, standsIn, damageOf, threshold, cap) : bySetup;
        const where = `${plane.nation}/${plane.name} loadout ${index + 1} at ${sheet.baseHp} HP`;
        if (!fit) {
          unfit.push(`${where}: ${text(load)}`);
          return setups ? { ...sheet, noSetup: true } : sheet;
        }

        const counted = fit.split.bases.length;
        fitted.push(`${where}: ${text(load)} (${sheet.basesDestroyed ?? "?"}) → ${text(fit.load)} (${counted})`);
        for (const other of bySetup?.alternatives ?? []) {
          const key = text(other.load);
          if (!beside.some((b) => b.index === index && text(b.load) === key)) beside.push({ index, load: other.load });
        }
        // A bomb the import swapped in keeps the one the sheet named.
        const sheetBombIds = new Map(
          items.flatMap((item): [string, string][] => (item.sheetBombId ? [[item.bombId, item.sheetBombId]] : [])),
        );
        const item = ({ bombId, count }: Rounds): LoadoutItem => {
          const sheetBombId = sheetBombIds.get(bombId);
          return sheetBombId ? { bombId, count, sheetBombId } : { bombId, count };
        };
        return {
          ...sheet,
          ...placed(fit.split, item),
          sheetPlan: { bases: sheet.bases, basesDestroyed: sheet.basesDestroyed },
        };
      }),
    }));

    // Each as a loadout of its own, after the sheet's so theirs keep their numbers,
    // written out for every bracket the loadout it stands beside is.
    const added = beside.map(({ index, load }): LoadoutOption => {
      offered.push(`${plane.nation}/${plane.name}: ${text(load)}, beside loadout ${index + 1}`);
      return {
        rewardMultiplier: null,
        noteMarker: null,
        note: null,
        discouraged: false,
        schedules: plane.options[index].schedules.map((sheet) => ({
          bracket: sheet.bracket,
          baseHp: sheet.baseHp,
          bracketNote: sheet.bracketNote,
          ...placed(splitIntoBases(load, damageOf, thresholdOf(sheet.baseHp), sheet.basesDestroyed ?? Infinity)),
        })),
        gameSetup: true,
      };
    });
    return { ...plane, options: [...options, ...added] };
  });

  console.log(
    `${fitted.length === 0 ? "ok   " : "note "} ${fitted.length}/${checked} plan(s) the aircraft cannot carry as ` +
      "written, the nearest it can put in their place (bases counted by the game's figures):",
  );
  for (const line of fitted) console.log(`        ${line}`);
  if (offered.length > 0) {
    console.log(`note  ${offered.length} more of the game's setup(s) as good, offered as loadouts of their own:`);
    for (const line of offered) console.log(`        ${line}`);
  }
  if (unfit.length > 0) {
    console.log(`warn  ${unfit.length} plan(s) nothing can be put in place of, kept for the planner to flag:`);
    for (const line of unfit) console.log(`        ${line}`);
  }
  if (unverified.size > 0) {
    console.log(
      `note  ${unverified.size} fixed setup(s) whose rounds no price of the game's bears out, never put in a plan's place`,
    );
  }
  return out;
}

/**
 * Cross-checks how many a choice hangs against what its own name says.
 *
 * The game names a good half of its hardpoint choices after the count —
 * `fab_250_x6`, `mer_mk82_x6` — which is an independent statement of the same
 * fact and so worth reading back. A rack is named for the munitions it holds
 * rather than for itself, so the comparison is against what the choice
 * delivers, not how many objects hang off the pylon.
 *
 * The handful left over are genuinely ambiguous rather than wrong: options that
 * come in `_left_x2`/`_right_x2` pairs, where the two may well be the pair
 * across both wings rather than two on this one. Nothing in the files settles
 * it, so they are reported rather than guessed at.
 */
function namedCounts(
  units: Record<string, unknown>,
  stores: { k: string; b?: (string | number)[] }[],
) {
  type Unit = { slots: { i: number; o: { n: string; w: number | [number, number][] }[] }[] };
  let checked = 0;
  let agreed = 0;
  const unsettled: string[] = [];

  for (const [unitId, unit] of Object.entries(units as Record<string, Unit>)) {
    for (const slot of unit.slots) {
      for (const option of slot.o) {
        const stated = /_x(\d+)\b/.exec(option.n);
        if (!stated) continue;
        checked++;

        const pairs = typeof option.w === "number" ? [[option.w, 1] as const] : option.w;
        // A bomb rack is named for what it holds, so read through to the
        // munitions. A rocket pod is named per launcher — "zuni_x2" is two
        // LAU-10s, eight rockets — so there the pods themselves are the count.
        const perLauncher = stores[pairs[0][0]]?.k === "rocket";
        const delivered = pairs.reduce((n, [index, count]) => {
          const held = stores[index]?.b?.[1];
          return n + count * (!perLauncher && typeof held === "number" ? held : 1);
        }, 0);

        if (delivered === Number(stated[1])) agreed++;
        else if (delivered < Number(stated[1]) && stores[pairs[0][0]]?.k === "bomb") {
          unsettled.push(`${unitId} slot ${slot.i} "${option.n}" carries ${delivered}`);
        }
      }
    }
  }

  console.log(
    `      ${agreed}/${checked} choice(s) named after a count carry exactly that many; ` +
      `${unsettled.length} state one where the name says more`,
  );
  for (const one of unsettled.slice(0, 4)) console.log(`        ${one}`);
}

/**
 * Checks the hardpoint rules against the hardpoints they talk about.
 *
 * These files are hand-maintained per aircraft and the per-slot presets are
 * plainly copied between slots, so references drift: a preset still named for
 * slot 4 sitting on slot 6 and depending on itself, or a dependency naming
 * "gun_pod" where the slot actually offers "gun_pod_slot3". None of it is ours to
 * fix, but a consumer that trusts a reference to resolve needs to know how often
 * it does not.
 */
/**
 * Holds the game's own ready-made loadouts up against the two rules the creator
 * hard-blocks on — the mass limit and the exclusion rules — since both come
 * from the same flight model that lists the presets.
 *
 * A preset the game itself offers must be buildable; where it is not, either
 * the game does not enforce the rule the way the creator does, or the file
 * contradicts itself (the Tornado GR.4 lists a Mk 82 loadout that its own
 * BannedWeaponPreset on slot 7 rules out). Either way it is worth a look
 * before trusting the block.
 */
function auditPresets(byUnit: Record<string, Armament>, catalogue: StoreRecord[]) {
  const massByFile = new Map(catalogue.map((s) => [s.file, s.massKg ?? 0]));
  const clashes = (
    rule: Armament["bans"][number],
    a: { slot: number; opt: string },
    b: { slot: number; opt: string },
  ) =>
    (rule.slot === a.slot && rule.preset === a.opt && rule.otherSlot === b.slot && rule.otherPreset === b.opt) ||
    (rule.slot === b.slot && rule.preset === b.opt && rule.otherSlot === a.slot && rule.otherPreset === a.opt);

  let checked = 0;
  const overweight: string[] = [];
  const excluded: string[] = [];

  for (const [unitId, armament] of Object.entries(byUnit)) {
    if (armament.style !== "pylons") continue;

    const offers = new Map<string, number[]>();
    const massOf = new Map<string, number>();
    for (const slot of armament.slots) {
      for (const option of slot.options) {
        offers.set(option.name, [...(offers.get(option.name) ?? []), slot.index]);
        const kg = option.stores.reduce((n, s) => n + (massByFile.get(s.file) ?? 0) * s.entries, 0);
        massOf.set(option.name, Math.max(massOf.get(option.name) ?? 0, kg));
      }
    }

    for (const preset of armament.presets) {
      const need = preset.weapons.map((w) => ({ opt: w.weapon, n: w.count, slots: offers.get(w.weapon) ?? [] }));
      if (need.some((x) => x.slots.length < x.n)) continue;
      checked++;

      const kg = preset.weapons.reduce((n, w) => n + (massOf.get(w.weapon) ?? 0) * w.count, 0);
      if (armament.maxLoadKg !== null && kg > armament.maxLoadKg * 1.01) {
        overweight.push(`${unitId} ${preset.name}: ${Math.round(kg)} kg against ${armament.maxLoadKg}`);
      }

      // A weapon name can be offered on several slots; the preset is fine if
      // any placement of it clears the rules.
      const picks: { slot: number; opt: string }[] = [];
      const used = new Set<number>();
      const clean = () =>
        picks.every((a, i) => picks.slice(i + 1).every((b) => !armament.bans.some((r) => clashes(r, a, b))));
      const place = (i: number, k: number): boolean => {
        if (i === need.length) return clean();
        if (k === need[i].n) return place(i + 1, 0);
        for (const slot of need[i].slots) {
          if (used.has(slot)) continue;
          used.add(slot);
          picks.push({ slot, opt: need[i].opt });
          const ok = place(i, k + 1);
          picks.pop();
          used.delete(slot);
          if (ok) return true;
        }
        return false;
      };
      if (!place(0, 0)) excluded.push(`${unitId} ${preset.name}`);
    }
  }

  const tag = (list: string[]) => (list.length === 0 ? "ok   " : "warn ");
  console.log(
    `${tag(overweight)} game presets: ${overweight.length}/${checked} exceed the airframe's own mass limit`,
  );
  for (const one of overweight.slice(0, 6)) console.log(`        ${one}`);
  console.log(
    `${tag(excluded)} game presets: ${excluded.length}/${checked} would be blocked by the exclusion rules as read`,
  );
  for (const one of excluded.slice(0, 6)) console.log(`        ${one}`);
}

function audit(byUnit: Record<string, Armament>) {
  const units = Object.entries(byUnit);
  let bansTotal = 0;
  let bansBroken = 0;
  let mutual = 0;
  let requiresTotal = 0;
  let requiresBroken = 0;

  for (const [, armament] of units) {
    const offered = new Map(armament.slots.map((s) => [s.index, new Set(s.options.map((o) => o.name))]));
    const resolves = (slot: number, preset: string) => offered.get(slot)?.has(preset) ?? false;

    const stated = new Set(
      armament.bans.map((b) => `${b.slot}|${b.preset}>${b.otherSlot}|${b.otherPreset}`),
    );
    for (const ban of armament.bans) {
      bansTotal++;
      if (!resolves(ban.slot, ban.preset) || !resolves(ban.otherSlot, ban.otherPreset)) bansBroken++;
      if (stated.has(`${ban.otherSlot}|${ban.otherPreset}>${ban.slot}|${ban.preset}`)) mutual++;
    }

    for (const rule of armament.requires) {
      requiresTotal++;
      if (!resolves(rule.slot, rule.preset) || !resolves(rule.otherSlot, rule.otherPreset)) {
        requiresBroken++;
      }
    }
  }

  const pct = (n: number, of: number) => (of === 0 ? "0" : ((100 * n) / of).toFixed(1));
  console.log(
    `${bansBroken === 0 ? "ok   " : "warn "} exclusion rules: ${bansBroken}/${bansTotal} ` +
      `reference something the aircraft does not offer`,
  );
  console.log(
    `note  ${pct(mutual, bansTotal)}% of exclusions are written from both sides; the rest are ` +
      "stated once and have to be read as mutual",
  );
  console.log(
    `${requiresBroken === 0 ? "ok   " : "note "} dependency rules: ${requiresBroken}/${requiresTotal} ` +
      `(${pct(requiresBroken, requiresTotal)}%) do not resolve — copy-paste in the source`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
