import { existsSync } from "node:fs";
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
 * The game's own files, kept as they came.
 *
 * Caching the parse instead was a false economy: every correction to the parser
 * meant pulling six hundred files again, which is exactly when you least want to.
 */
const RAW_DIR = path.join(process.cwd(), ".cache", "armament", "raw");
/** Reference material for auditing, deliberately out of the bundle. */
const OUT_FULL = path.join(process.cwd(), ".cache", "armament", "armament.json");

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

  report(aircraft, unitIds, byUnit, missing);
}

function report(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  missing: string[],
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

  const hidden = sum((u) => u.slots.reduce((n, s) => n + s.hidden.length, 0));
  console.log(`      ${hidden} hardpoint choice(s) the loadout menu does not show`);

  audit(byUnit);

  if (missing.length > 0) {
    console.log(`warn  ${missing.length} unit(s) had no flight model: ${missing.slice(0, 6).join(", ")}`);
  }
  const unmatched = aircraft.filter((p) => !unitIds[p.id]).map((p) => p.name);
  if (unmatched.length > 0) {
    console.log(`warn  ${unmatched.length} aircraft have no unit to look up: ${unmatched.join(", ")}`);
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
    const offered = new Map(armament.slots.map((s) => [s.index, new Set(s.presets)]));
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
