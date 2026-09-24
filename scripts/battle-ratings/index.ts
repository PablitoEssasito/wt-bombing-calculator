import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft, BattleRatings } from "../../src/domain/types";
import { battleRatingsOf, type UnitCost } from "./parse";

/**
 * Reads every aircraft's battle rating, in all six modes, from the game's own
 * `wpcost.blkx`, and writes them to src/data/battle-ratings.json.
 *
 * It also overwrites `br` in aircraft.json with the game's Air RB. The sheet
 * lags a patch or two behind on BR changes, and everything else (the planner's
 * base tiers, the tiles, the changelog) reads `br`. Run it after `etl`, which
 * writes aircraft.json afresh from the sheet, and after `images`, whose
 * images.json maps each aircraft to its game unit.
 */
const WPCOST =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/char.vromfs.bin_u/config/wpcost.blkx";
const DATA = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA, "battle-ratings.json");
/** Only the ranks, so the cache is a fraction of the 32 MB file. */
const CACHE = path.join(process.cwd(), ".cache", "wpcost-ranks.json");

const useCache = process.argv.includes("--cache");

async function loadCosts(): Promise<Record<string, UnitCost>> {
  if (useCache && existsSync(CACHE)) return JSON.parse(await readFile(CACHE, "utf8"));

  const response = await fetch(WPCOST);
  if (!response.ok) throw new Error(`wpcost: HTTP ${response.status}`);
  const all = (await response.json()) as Record<string, unknown>;
  const costs: Record<string, UnitCost> = {};
  for (const [unit, value] of Object.entries(all)) {
    if (typeof value !== "object" || value === null) continue;
    const ranks = Object.entries(value).filter(([key]) => key.startsWith("economicRank"));
    if (ranks.length > 0) costs[unit] = Object.fromEntries(ranks);
  }

  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(costs));
  return costs;
}

async function main() {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;
  const aircraft = await read<Aircraft[]>("aircraft.json");
  const unitIds = await read<Record<string, string>>("images.json");
  const costs = await loadCosts();

  const ratings: Record<string, BattleRatings> = {};
  const missing: string[] = [];
  const moved: string[] = [];
  for (const plane of aircraft) {
    const cost = costs[unitIds[plane.id] ?? ""];
    if (!cost) {
      missing.push(plane.name);
      continue;
    }
    ratings[plane.id] = battleRatingsOf(cost);
    const rb = ratings[plane.id].air[1];
    if (rb !== null && rb !== plane.br) {
      moved.push(`${plane.name} ${plane.br.toFixed(1)} → ${rb.toFixed(1)}`);
      plane.br = rb;
    }
  }

  await writeFile(OUT, JSON.stringify(ratings));
  await writeFile(path.join(DATA, "aircraft.json"), JSON.stringify(aircraft));

  const inGround = Object.values(ratings).filter((r) => r.ground.some((br) => br !== null)).length;
  console.log(`Battle ratings for ${Object.keys(ratings).length}/${aircraft.length} aircraft, ${inGround} flyable in ground battles`);
  if (missing.length > 0) console.log(`  no game unit (kept the sheet's BR): ${missing.join(", ")}`);
  console.log(`Air RB differs from the sheet for ${moved.length}:`);
  for (const line of moved) console.log(`  ${line}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
