import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AircraftEconomy } from "../../src/domain/reward";
import type { Aircraft, BattleRatings } from "../../src/domain/types";
import { battleRatingsOf, economyOf, rewardConstantsOf, weaponDamageByFile, type UnitCost } from "./parse";

/**
 * Reads every aircraft's battle rating, in all six modes, from the game's own
 * `wpcost.blkx`, and writes them to src/data/battle-ratings.json.
 *
 * It also overwrites `br` in aircraft.json with the game's Air RB. The sheet
 * lags a patch or two behind on BR changes, and everything else (the planner's
 * base tiers, the tiles, the changelog) reads `br`. Run it after `etl`, which
 * writes aircraft.json afresh from the sheet, and after `images`, whose
 * images.json maps each aircraft to its game unit.
 *
 * The same file prices everything, so this also writes what rewards are
 * computed from: each aircraft's multipliers and the damage each custom-slot
 * weapon counts for (src/data/economy.json), and the game-wide constants from
 * `warpoints.blkx` and `rank.blkx` (src/data/reward-constants.json). Run it
 * after `armament:cache` too — the weapon table is keyed by its store files.
 */
const DATAMINE = "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/char.vromfs.bin_u/config";
const DATA = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA, "battle-ratings.json");
const ECONOMY = path.join(DATA, "economy.json");
const CONSTANTS = path.join(DATA, "reward-constants.json");
/** Only the fields read here, so the cache is a fraction of the 32 MB file. */
const CACHE = path.join(process.cwd(), ".cache", "wpcost-slim.json");
const CONFIG_CACHE = path.join(process.cwd(), ".cache", "reward-config.json");

const useCache = process.argv.includes("--cache");

type Weapon = { weaponDamage?: number; isWeaponForCustomSlot?: boolean };
type Slim = { units: Record<string, UnitCost>; weapons: [string, Weapon][] };

const UNIT_FIELDS = [
  "rewardMulArcade",
  "rewardMulHistorical",
  "rewardMulSimulation",
  "expMul",
  "costGold",
  "premPackAir",
  "unitClass",
  "rank",
];

async function fetchJson(file: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${DATAMINE}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

async function loadCosts(): Promise<Slim> {
  if (useCache && existsSync(CACHE)) return JSON.parse(await readFile(CACHE, "utf8"));

  const all = await fetchJson("wpcost.blkx");
  const units: Record<string, UnitCost> = {};
  const weapons = new Map<string, Weapon>();
  for (const [unit, value] of Object.entries(all)) {
    if (typeof value !== "object" || value === null) continue;
    const fields = Object.entries(value).filter(
      ([key]) => key.startsWith("economicRank") || UNIT_FIELDS.includes(key),
    );
    if (fields.some(([key]) => key.startsWith("economicRank"))) units[unit] = Object.fromEntries(fields);
    const unitWeapons = (value as { weapons?: Record<string, Weapon> }).weapons ?? {};
    for (const [name, weapon] of Object.entries(unitWeapons)) {
      if (weapon.isWeaponForCustomSlot && typeof weapon.weaponDamage === "number") {
        weapons.set(name, { weaponDamage: weapon.weaponDamage, isWeaponForCustomSlot: true });
      }
    }
  }

  const slim: Slim = { units, weapons: [...weapons] };
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(slim));
  return slim;
}

type Config = { warpoints: Record<string, unknown>; ranks: Record<string, unknown>; items: Record<string, unknown> };

async function loadConfig(): Promise<Config> {
  if (useCache && existsSync(CONFIG_CACHE)) return JSON.parse(await readFile(CONFIG_CACHE, "utf8"));
  const items = await fetchJson("items.blkx");
  const config: Config = {
    warpoints: await fetchJson("warpoints.blkx"),
    ranks: await fetchJson("rank.blkx"),
    // Only the boosters: the file is 600 KB of every item in the game.
    items: Object.fromEntries(Object.entries(items).filter(([, item]) => (item as { type?: string })?.type === "rateBooster")),
  };
  await mkdir(path.dirname(CONFIG_CACHE), { recursive: true });
  await writeFile(CONFIG_CACHE, JSON.stringify(config));
  return config;
}

async function main() {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;
  const aircraft = await read<Aircraft[]>("aircraft.json");
  const unitIds = await read<Record<string, string>>("images.json");
  const armament = await read<{ files: string[] }>("armament.json");
  const { units, weapons } = await loadCosts();
  const { warpoints, ranks, items } = await loadConfig();

  const ratings: Record<string, BattleRatings> = {};
  const economy: Record<string, AircraftEconomy> = {};
  const missing: string[] = [];
  const moved: string[] = [];
  for (const plane of aircraft) {
    const cost = units[unitIds[plane.id] ?? ""];
    if (!cost) {
      missing.push(plane.name);
      continue;
    }
    ratings[plane.id] = battleRatingsOf(cost);
    economy[plane.id] = economyOf(cost);
    const rb = ratings[plane.id].air[1];
    if (rb !== null && rb !== plane.br) {
      moved.push(`${plane.name} ${plane.br.toFixed(1)} → ${rb.toFixed(1)}`);
      plane.br = rb;
    }
  }
  const weaponDamage = weaponDamageByFile(weapons, armament.files);

  await writeFile(OUT, JSON.stringify(ratings));
  await writeFile(path.join(DATA, "aircraft.json"), JSON.stringify(aircraft));
  await writeFile(ECONOMY, JSON.stringify({ aircraft: economy, weaponDamage }));
  await writeFile(CONSTANTS, JSON.stringify(rewardConstantsOf(warpoints, ranks, items)));

  const inGround = Object.values(ratings).filter((r) => r.ground.some((br) => br !== null)).length;
  console.log(`Battle ratings for ${Object.keys(ratings).length}/${aircraft.length} aircraft, ${inGround} flyable in ground battles`);
  console.log(`Damage priced for ${Object.keys(weaponDamage).length} of ${new Set(armament.files).size} store files`);
  if (missing.length > 0) console.log(`  no game unit (kept the sheet's BR): ${missing.join(", ")}`);
  console.log(`Air RB differs from the sheet for ${moved.length}:`);
  for (const line of moved) console.log(`  ${line}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
