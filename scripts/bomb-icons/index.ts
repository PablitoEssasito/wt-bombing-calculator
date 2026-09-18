import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bomb as FullBomb } from "../../src/domain/types";
import { downloadIcons, fetchWeaponDefs } from "./fetch";
import { matchBombIcons } from "./match";

const OUT_DATA = path.join(process.cwd(), "src", "data", "bomb-icons.json");

const useCache = process.argv.includes("--cache");

async function main() {
  const bombs = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "bombs.json"), "utf8"),
  ) as FullBomb[];

  console.log(useCache ? "Using cached weapon definitions where available\n" : "Fetching weapon definitions from the datamine\n");
  const defs = await fetchWeaponDefs(useCache);
  console.log(`Loaded ${defs.length} weapon definitions`);

  const { matches, unmatched } = matchBombIcons(bombs, defs);
  const direct = [...matches.values()].filter((m) => m.confidence === "matched").length;
  const fallback = matches.size - direct;
  console.log(
    `Matched ${matches.size}/${bombs.length} bombs to an icon (${direct} direct, ${fallback} size-class fallback)`,
  );
  if (unmatched.length > 0) {
    console.log(`Unmatched (${unmatched.length}):`);
    for (const bomb of unmatched) console.log(`   ${bomb.chartName || bomb.fullName}`);
  }

  const iconTypes = [...new Set([...matches.values()].map((m) => m.iconType))].sort();
  console.log(`\nDownloading ${iconTypes.length} distinct icons...`);
  const { downloaded, failed } = await downloadIcons(iconTypes);
  console.log(`Icons ready (${downloaded} newly downloaded, ${failed.length} failed)`);
  if (failed.length > 0) console.log(`  ${failed.join(", ")}`);

  const map: Record<string, string> = {};
  for (const [bombId, match] of matches) map[bombId] = match.iconType;
  await writeFile(OUT_DATA, JSON.stringify(map));
  console.log(`\nWrote ${Object.keys(map).length} bomb -> icon references to src/data/bomb-icons.json`);

  if (unmatched.length > 0 || failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
