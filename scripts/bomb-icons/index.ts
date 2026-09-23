import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bomb as FullBomb } from "../../src/domain/types";
import { downloadIcons, fetchWeaponDefs } from "./fetch";
import { matchBombIcons, presetIcons, type PresetIcon } from "./match";

const OUT_DATA = path.join(process.cwd(), "src", "data", "bomb-icons.json");

const useCache = process.argv.includes("--cache");

/** Just the parts of src/data/armament.json this script reads. */
type CompactArmament = {
  stores: { b?: [string, number] }[];
  units: Record<string, { slots: { o: { i?: string; w: number | [number, number][] }[] }[] }>;
};

async function main() {
  const bombs = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "bombs.json"), "utf8"),
  ) as FullBomb[];

  console.log(useCache ? "Using cached weapon definitions where available\n" : "Fetching weapon definitions from the datamine\n");
  const defs = await fetchWeaponDefs(useCache);
  console.log(`Loaded ${defs.length} weapon definitions`);

  const { matches, unmatched: unmatchedByMass } = matchBombIcons(bombs, defs);

  // Where the loadout menu draws a bomb, that icon wins over the weapon file's
  // own — see presetIcons. Needs `npm run armament` to have run first.
  const armament = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "armament.json"), "utf8"),
  ) as CompactArmament;
  const presets: PresetIcon[] = Object.values(armament.units).flatMap((unit) =>
    unit.slots.flatMap((slot) =>
      slot.o.flatMap((option) => {
        if (!option.i) return [];
        const refs = typeof option.w === "number" ? [option.w] : option.w.map(([index]) => index);
        const bombIds = refs.map((index) => armament.stores[index]?.b?.[0]);
        return bombIds.every((id): id is string => id !== undefined)
          ? [{ iconType: option.i, bombIds }]
          : [];
      }),
    ),
  );
  const known = new Set([
    ...defs.flatMap((d) => (d.iconType ? [d.iconType] : [])),
    ...presets.map((p) => p.iconType),
  ]);
  let fromPresets = 0;
  for (const [bombId, iconType] of presetIcons(presets, known, new Map(bombs.map((b) => [b.id, b.kind])))) {
    if (matches.get(bombId)?.iconType !== iconType) fromPresets++;
    matches.set(bombId, { iconType, confidence: "matched" });
  }
  const unmatched = unmatchedByMass.filter((bomb) => !matches.has(bomb.id));
  const direct = [...matches.values()].filter((m) => m.confidence === "matched").length;
  const fallback = matches.size - direct;
  console.log(
    `Matched ${matches.size}/${bombs.length} bombs to an icon (${direct} direct, ${fallback} size-class fallback)`,
  );
  console.log(`${fromPresets} of them take the loadout menu's own icon over the weapon file's`);
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
