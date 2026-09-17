import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft, Bomb } from "../../src/domain/types";
import { parseArmament, presetPath, type Armament } from "./parse";
import { isPhysicalCount } from "./stores";

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

type StoreRecord = {
  file: string;
  name: string | null;
  short: string | null;
  massKg: number | null;
  kind: string;
  bomb: { id: string; count: number } | null;
  container: boolean;
};

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
  const aircraft = JSON.parse(
    await readFile(path.join(DATA_DIR, "aircraft.json"), "utf8"),
  ) as Aircraft[];
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

  const mounts: Record<string, "pylons" | "setups"> = {};
  for (const plane of aircraft) {
    const armament = byUnit[unitIds[plane.id]];
    if (armament) mounts[plane.id] = armament.style;
  }

  await mkdir(path.dirname(OUT_FULL), { recursive: true });
  await writeFile(OUT_FULL, JSON.stringify(byUnit), "utf8");
  await writeFile(OUT_MOUNTS, JSON.stringify(mounts), "utf8");

  const bombs = JSON.parse(await readFile(path.join(DATA_DIR, "bombs.json"), "utf8")) as Bomb[];
  await writePayload(byUnit);
  report(aircraft, unitIds, byUnit, missing, bombs);
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
   * The flight model states a repeat count next to every weapon reference, but it
   * means ammunition on a gun and physical quantity on a rack — see
   * `isPhysicalCount`. This is where that gets sorted out, since it is the first
   * point with the store catalogue in hand to tell the two apart.
   */
  let ammoMiscounted = 0;
  const countOf = (file: string, count: number): number => {
    const store = byFile.get(file);
    if (store && !isPhysicalCount(store) && count > 1) ammoMiscounted++;
    return store && !isPhysicalCount(store) ? 1 : count;
  };

  const units: Record<string, unknown> = {};
  for (const [unitId, armament] of Object.entries(byUnit)) {
    if (armament.style !== "pylons") continue;

    units[unitId] = {
      max: armament.maxLoadKg,
      left: armament.maxLeftKg,
      right: armament.maxRightKg,
      diff: armament.maxDisbalanceKg,
      slots: armament.slots.map((slot) => ({
        i: slot.index,
        o: slot.options
          .filter((option) => !option.hidden)
          .map((option) => {
            const resolved = option.stores.map((store) => ({
              file: store.file,
              count: countOf(store.file, store.count),
            }));
            return {
              n: option.name,
              // One store carried once is the ordinary case, and writes as a bare index.
              w:
                resolved.length === 1 && resolved[0].count === 1
                  ? intern(resolved[0].file)
                  : resolved.map((store) => [intern(store.file), store.count]),
            };
          }),
      })),
      bans: armament.bans.map((r) => [r.slot, r.preset, r.otherSlot, r.otherPreset]),
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
      ...(store.bomb ? { b: [store.bomb.id, store.bomb.count] } : {}),
    };
  });

  const payload = { files, stores, units };
  await writeFile(OUT_ARMAMENT, JSON.stringify(payload), "utf8");
  console.log(
    `      wrote ${Object.keys(units).length} buildable aircraft and ${files.length} stores ` +
      `to src/data/armament.json (${Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024)} KB)`,
  );
  if (ammoMiscounted > 0) {
    console.log(
      `      corrected ${ammoMiscounted} hardpoint choice(s) that stated ammunition as a physical ` +
        `count — a cannon's magazine, not that many gun pods`,
    );
  }
}

function report(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  missing: string[],
  bombs: Bomb[],
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
  weighLoadouts(aircraft, unitIds, byUnit, bombs);

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
 * the limit is not a loadout anyone can take, whatever the sheet says — the
 * ready-made presets all stay under it, the heaviest reaching 96%, so the ceiling
 * is real and enforced.
 *
 * Bomb masses agree with the game's to the gram, which is why the tolerance here
 * is small: it exists for rounding in the sheet's own figures, where twelve
 * FAB-100s come to 1,248 kg against a 1,245 kg limit.
 */
function weighLoadouts(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  bombs: Bomb[],
) {
  const TOLERANCE = 1.01;
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
            // Rockets carry no mass in the sheet, so the total would understate.
            if (kg === null || kg === undefined) return;
            mass += kg * item.count;
          }
        }
        heaviest = Math.max(heaviest, mass);
      }
      if (heaviest === 0) return;
      checked++;
      if (heaviest > limit * TOLERANCE) {
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
 * Checks the hardpoint rules against the hardpoints they talk about.
 *
 * These files are hand-maintained per aircraft and the per-slot presets are
 * plainly copied between slots, so references drift: a preset still named for
 * slot 4 sitting on slot 6 and depending on itself, or a dependency naming
 * "gun_pod" where the slot actually offers "gun_pod_slot3". None of it is ours to
 * fix, but a consumer that trusts a reference to resolve needs to know how often
 * it does not.
 */
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
