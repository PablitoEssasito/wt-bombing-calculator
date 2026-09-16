import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft } from "../../src/domain/types";
import { parseArmament, presetPath, type Armament } from "./parse";

const RAW =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/aces.vromfs.bin_u/gamedata";

const DATA_DIR = path.join(process.cwd(), "src", "data");
/** Shipped: the one field the app reads at runtime. */
const OUT_MOUNTS = path.join(DATA_DIR, "mounts.json");
/**
 * Kept out of the bundle: the full armament record, which is reference material
 * for the validation below rather than anything a page renders.
 */
const CACHE_DIR = path.join(process.cwd(), ".cache", "armament");
const CACHE_FILE = path.join(CACHE_DIR, "armament.json");

const CONCURRENCY = 8;

const useCache = process.argv.includes("--cache");

async function getJson(relativePath: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${RAW}/${relativePath}`);
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readArmament(unitId: string): Promise<Armament | null> {
  const fm = await getJson(`flightmodels/${unitId}.blkx`);
  if (!fm) return null;

  // Each preset's composition lives in its own small file beside the flight model.
  const references = fm.weapon_presets as { preset?: unknown } | undefined;
  const entries = references?.preset;
  const list = (Array.isArray(entries) ? entries : entries ? [entries] : []) as {
    name: string;
    blk: string;
  }[];

  const bodies = new Map<string, Record<string, unknown>>();
  await Promise.all(
    list.map(async (entry) => {
      const body = await getJson(presetPath(entry.blk));
      if (body) bodies.set(String(entry.name), body);
    }),
  );

  return parseArmament(fm, bodies);
}

async function main() {
  const aircraft = JSON.parse(
    await readFile(path.join(DATA_DIR, "aircraft.json"), "utf8"),
  ) as Aircraft[];
  const unitIds = JSON.parse(
    await readFile(path.join(DATA_DIR, "images.json"), "utf8"),
  ) as Record<string, string>;

  let cached: Record<string, Armament> = {};
  if (useCache) {
    try {
      cached = JSON.parse(await readFile(CACHE_FILE, "utf8")) as Record<string, Armament>;
    } catch {
      // Nothing cached yet.
    }
  }
  console.log(
    useCache
      ? `Using ${Object.keys(cached).length} cached record(s); fetching the rest`
      : "Reading every flight model from the datamine",
  );

  const byUnit: Record<string, Armament> = { ...cached };
  const wanted = [...new Set(aircraft.map((p) => unitIds[p.id]).filter(Boolean))];
  const queue = wanted.filter((unitId) => !(unitId in byUnit));
  const missing: string[] = [];
  let done = 0;

  async function worker() {
    for (let unitId = queue.shift(); unitId; unitId = queue.shift()) {
      const armament = await readArmament(unitId);
      if (armament) byUnit[unitId] = armament;
      else missing.push(unitId);
      if (++done % 100 === 0) console.log(`  ${done}/${queue.length + done} flight models read...`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mounts: Record<string, "pylons" | "setups"> = {};
  for (const plane of aircraft) {
    const armament = byUnit[unitIds[plane.id]];
    if (armament) mounts[plane.id] = armament.style;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(byUnit), "utf8");
  await writeFile(OUT_MOUNTS, JSON.stringify(mounts), "utf8");

  report(aircraft, unitIds, byUnit, missing);
}

function report(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  missing: string[],
) {
  const records = aircraft.flatMap((p) => {
    const armament = byUnit[unitIds[p.id]];
    return armament ? [{ plane: p, armament }] : [];
  });

  const pylons = records.filter((r) => r.armament.style === "pylons");
  const setups = records.length - pylons.length;
  const presets = records.reduce((n, r) => n + r.armament.presets.length, 0);
  const bans = records.reduce((n, r) => n + r.armament.bans.length, 0);
  const withBans = records.filter((r) => r.armament.bans.length > 0).length;
  const weighed = records.filter((r) => r.armament.maxLoadKg !== null).length;

  console.log(`\n--- armament ---`);
  console.log(`ok    ${records.length}/${aircraft.length} aircraft read from the datamine`);
  console.log(`      ${pylons.length} mount per pylon, ${setups} offer fixed setups only`);
  console.log(`      ${presets} loadout presets in total`);
  console.log(`      ${bans} exclusion rule(s) across ${withBans} aircraft`);
  console.log(`      ${weighed} state a maximum load`);
  if (missing.length > 0) {
    console.log(`warn  ${missing.length} unit(s) had no flight model: ${missing.slice(0, 6).join(", ")}`);
  }

  const unmatched = aircraft.filter((p) => !unitIds[p.id]).map((p) => p.name);
  if (unmatched.length > 0) {
    console.log(`warn  ${unmatched.length} aircraft have no wiki unit to look up: ${unmatched.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
