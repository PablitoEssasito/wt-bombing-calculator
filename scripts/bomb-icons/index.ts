import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bomb as FullBomb } from "../../src/domain/types";
import { AIRCRAFT_ICON_OVERRIDES, aircraftIcons, type RawUnit } from "./aircraft";
import { downloadIcons, fetchWeaponDefs } from "./fetch";
import { presetIcons, type PresetIcon } from "../../src/domain/preset-icons";
import { matchBombIcons } from "./match";

const OUT_DATA = path.join(process.cwd(), "src", "data", "bomb-icons.json");
const OUT_AIRCRAFT = path.join(process.cwd(), "src", "data", "aircraft-bomb-icons.json");
/** Raw flight models, as `npm run armament` caches them. */
const RAW_DIR = path.join(process.cwd(), ".cache", "armament", "raw");

const useCache = process.argv.includes("--cache");

/** Just the parts of src/data/armament.json this script reads. */
type CompactArmament = {
  files: string[];
  stores: { b?: [string, number] }[];
  units: Record<string, CompactUnit>;
};
type CompactUnit = { slots: { o: { i?: string; w: number | [number, number][] }[] }[] };

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
  const presetsOf = (unit: CompactUnit): PresetIcon[] =>
    unit.slots.flatMap((slot) =>
      slot.o.flatMap((option) => {
        if (!option.i) return [];
        const refs = typeof option.w === "number" ? [option.w] : option.w.map(([index]) => index);
        const bombIds = refs.map((index) => armament.stores[index]?.b?.[0]);
        return bombIds.every((id): id is string => id !== undefined)
          ? [{ iconType: option.i, bombIds }]
          : [];
      }),
    );
  const presets = Object.values(armament.units).flatMap(presetsOf);
  const known = new Set([
    ...defs.flatMap((d) => (d.iconType ? [d.iconType] : [])),
    ...presets.map((p) => p.iconType),
  ]);
  const kinds = new Map(bombs.map((b) => [b.id, b.kind]));
  let fromPresets = 0;
  for (const [bombId, iconType] of presetIcons(presets, known, kinds)) {
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

  // Each aircraft's own menu, stored only where it differs from the map above.
  if (!existsSync(RAW_DIR)) throw new Error("No cached flight models — run `npm run armament` first");
  const unitsByAircraft = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "images.json"), "utf8"),
  ) as Record<string, string>;
  const bombOfFile = new Map(armament.files.map((file, i) => [file.toLowerCase(), armament.stores[i]?.b?.[0]]));
  const iconOfFile = new Map(defs.map((d) => [path.basename(d.path, ".blkx").toLowerCase(), d.iconType]));
  const perAircraft: Record<string, Record<string, string>> = {};
  const missingRaw: string[] = [];
  for (const [aircraftId, unitId] of Object.entries(unitsByAircraft)) {
    const rawPath = path.join(RAW_DIR, `${unitId}.json`);
    if (!existsSync(rawPath)) {
      missingRaw.push(aircraftId);
      continue;
    }
    const icons = aircraftIcons({
      slotPresets: armament.units[unitId] ? presetsOf(armament.units[unitId]) : [],
      raw: JSON.parse(await readFile(rawPath, "utf8")) as RawUnit,
      bombOfFile,
      iconOfFile,
      known,
      kinds,
    });
    for (const [bombId, iconType] of Object.entries(AIRCRAFT_ICON_OVERRIDES[aircraftId] ?? {})) {
      icons.set(bombId, iconType);
    }
    // Sorted, so a rerun that finds the same icons writes the same file.
    const own = [...icons]
      .filter(([bombId, iconType]) => map[bombId] !== iconType)
      .sort(([a], [b]) => a.localeCompare(b));
    if (own.length > 0) perAircraft[aircraftId] = Object.fromEntries(own);
  }
  await writeFile(OUT_AIRCRAFT, JSON.stringify(perAircraft));
  console.log(
    `Wrote ${Object.keys(perAircraft).length} aircraft whose menu draws a bomb differently to src/data/aircraft-bomb-icons.json`,
  );
  if (missingRaw.length > 0) {
    console.log(`note  ${missingRaw.length} aircraft have no cached flight model: ${missingRaw.slice(0, 6).join(", ")}`);
  }
  const ownIcons = [...new Set(Object.values(perAircraft).flatMap((icons) => Object.values(icons)))];
  const own = await downloadIcons(ownIcons.filter((iconType) => !iconTypes.includes(iconType)));
  if (own.failed.length > 0) {
    console.log(`Failed to download ${own.failed.length} icon(s) only some aircraft use: ${own.failed.join(", ")}`);
    failed.push(...own.failed);
  }

  if (unmatched.length > 0 || failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
