import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft } from "../../src/domain/types";
import { PREFIXED_LOCALES } from "../../src/i18n/locales";
import { langColumns, parseLangCsv } from "./parse";

/**
 * Aircraft and weapon names in every translated language, exactly as the
 * game's own client shows them — read from its localisation files rather than
 * translated here. Writes src/data/names.json:
 *
 *   { pl: { aircraft: { [aircraftId]: name }, weapons: { [englishName]: name } }, ru: … }
 *
 * Aircraft are looked up by the game unit images.json matched them to, under
 * the `<unit>_shop` key the tech tree uses. Weapons by the file each loadout
 * choice hangs (armament.json lists them), keyed on the English name the
 * loadout creator already shows, which is what it looks the translation up by.
 * Anything with no translation is left out and stays in English.
 *
 * Run after `images` and `armament` (it reads both), with `--cache` to reuse
 * the downloaded files.
 */
const LANG_URL = (file: string) =>
  `https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/lang.vromfs.bin_u/lang/${file}`;
const CACHE_DIR = path.join(process.cwd(), ".cache", "lang");
const DATA = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA, "names.json");
/** The game's own labels for the armament pages' figures, in every language the site has. */
const OUT_LABELS = path.join(DATA, "game-lang.json");
/** The game's names for the aircraft outside the site that carry a weapon (other-carriers.json). */
const OUT_UNITS = path.join(DATA, "unit-names.json");
/** One entry per round of ordnance, from `npm run stores` — every weapon the armament table lists. */
const ROUNDS = path.join(process.cwd(), ".cache", "armament", "rounds.json");

/**
 * The labels the armament pages borrow from the game, whole keys and families:
 * `missile/guidance/tv+IOG+GNSS` reads "TV+IOG+GNSS", `rocket/warhead/aphe`
 * "SAP-HE", `explosiveType/pbxn_3` "PBXN-3" — and the names of the figures
 * themselves, as the game's weapon tooltip words them.
 */
const LABEL_PREFIXES = ["missile/guidance/", "missile/aiming/", "rocket/warhead/", "explosiveType/"];
const LABEL_KEYS = [
  "missile/guidance",
  "missile/launchRange",
  "missile/seekerRange",
  "missile/seekerRange/rearAspect",
  "missile/seekerRange/allAspect",
  "missile/aspect",
  "missile/aspect/allAspect",
  "missile/aspect/rearAspect",
  "missile/irccm",
  "missile/loadFactorMax",
  "missile/timeGuidance",
  "missile/timeSelfdestruction",
  "missile/armingDistance",
  "rocket/maxSpeed",
  "rocket/warhead",
  "guaranteedRange",
  "firingRange",
  "torpedo/maxSpeedInWater",
  "torpedo/distanceToLive",
  "torpedo/armingDistance",
  "weapons/drop_speed_range_text",
  "weapons/drop_height_range_text",
  "bullet_properties/explosiveType",
  "bullet_properties/explosiveMass",
  "bullet_properties/explosiveMassInTNTEquivalent",
  "bullet_properties/proximityFuze/triggerRadius",
  "bullet_properties/diveDepth",
  "bullet_properties/caliber",
  "bullet_properties/armorPiercing",
  "bombProperties/maxArmorPenetration",
  "bombProperties/destroyRadiusArmored",
  "bombProperties/destroyRadiusNotArmored",
  "shop/tank_mass/tooltip",
  "shop/estimated_damage_to_base",
];

const useCache = process.argv.includes("--cache");

/** The column each language's text sits in, by the header's own names. */
const COLUMN_OF = { pl: "Polish", ru: "Russian" } as const;

type Round = { file: string; name: string | null; short: string | null };

async function loadCsv(file: string): Promise<string> {
  const cached = path.join(CACHE_DIR, file);
  if (useCache && existsSync(cached)) return readFile(cached, "utf8");
  const response = await fetch(LANG_URL(file));
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const text = await response.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cached, text, "utf8");
  return text;
}

type Compact = { files: string[]; stores: { n: string; s?: string }[] };

async function main() {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;
  const aircraft = await read<Aircraft[]>("aircraft.json");
  const unitIds = await read<Record<string, string>>("images.json");
  const armament = await read<Compact>("armament.json");

  const units = parseLangCsv(await loadCsv("units.csv"));
  const weaponry = parseLangCsv(await loadCsv("units_weaponry.csv"));
  const menu = parseLangCsv(await loadCsv("menu.csv"));
  const rounds = existsSync(ROUNDS) ? (JSON.parse(await readFile(ROUNDS, "utf8")) as Round[]) : [];
  const otherUnits = [
    ...new Set(Object.values(await read<Record<string, string[]>>("other-carriers.json")).flat()),
  ].sort();

  const out: Record<string, { aircraft: Record<string, string>; weapons: Record<string, string> }> = {};
  for (const locale of PREFIXED_LOCALES) {
    const unitNames = langColumns(units, "English", COLUMN_OF[locale]);
    const weaponNames = langColumns(weaponry, "English", COLUMN_OF[locale]);

    const aircraftNames: Record<string, string> = {};
    for (const plane of aircraft) {
      const unit = unitIds[plane.id];
      const name = unit ? (unitNames.get(`${unit}_shop`) ?? unitNames.get(`${unit}_0`)) : undefined;
      if (name?.translated) aircraftNames[plane.id] = name.translated;
    }

    const weapons: Record<string, string> = {};
    const nameWeapon = (file: string, full: string | null | undefined, short: string | null | undefined) => {
      const fullName = weaponNames.get(`weapons/${file}`);
      const shortName = weaponNames.get(`weapons/${file}/short`);
      if (full && fullName?.translated && fullName.translated !== full) weapons[full] = fullName.translated;
      if (short && shortName?.translated && shortName.translated !== short) weapons[short] = shortName.translated;
    };
    armament.files.forEach((file, i) => nameWeapon(file, armament.stores[i]?.n, armament.stores[i]?.s));
    // Every round the armament table lists, the game's own rows' names among them.
    for (const round of rounds) nameWeapon(round.file, round.name, round.short);

    out[locale] = { aircraft: aircraftNames, weapons };
    console.log(
      `${locale}: ${Object.keys(aircraftNames).length}/${aircraft.length} aircraft named, ` +
        `${Object.keys(weapons).length} weapon names translated`,
    );
  }

  await writeFile(OUT, JSON.stringify(out));

  // Labels, English included: the site shows the game's wording in every language.
  const labels: Record<string, Record<string, string>> = { en: {}, pl: {}, ru: {} };
  for (const table of [weaponry, menu]) {
    for (const locale of ["en", ...PREFIXED_LOCALES] as const) {
      const column = locale === "en" ? "English" : COLUMN_OF[locale];
      for (const [key, text] of langColumns(table, "English", column)) {
        if (!LABEL_KEYS.includes(key) && !LABEL_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
        const value = locale === "en" ? text.english : text.translated || text.english;
        if (value) labels[locale][key] ??= value;
      }
    }
  }
  const missingLabels = LABEL_KEYS.filter((key) => !labels.en[key]);
  await writeFile(OUT_LABELS, JSON.stringify(sortKeys(labels)));
  console.log(
    `labels: ${Object.keys(labels.en).length} of the game's own` +
      (missingLabels.length > 0 ? `; not found: ${missingLabels.join(", ")}` : ""),
  );

  // The aircraft outside the site, as the game names them in its tech tree.
  const unitNames: Record<string, Record<string, string>> = { en: {}, pl: {}, ru: {} };
  for (const locale of ["en", ...PREFIXED_LOCALES] as const) {
    const names = langColumns(units, "English", locale === "en" ? "Polish" : COLUMN_OF[locale]);
    for (const unit of otherUnits) {
      const name = names.get(`${unit}_shop`) ?? names.get(`${unit}_0`);
      const value = locale === "en" ? name?.english : name?.translated || name?.english;
      if (value) unitNames[locale][unit] = value;
    }
  }
  await writeFile(OUT_UNITS, JSON.stringify(unitNames));
  console.log(`aircraft outside the site: ${Object.keys(unitNames.en).length}/${otherUnits.length} named`);
}

/** Keys in order, so a rerun that finds the same labels writes the same file. */
function sortKeys(byLocale: Record<string, Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(byLocale).map(([locale, labels]) => [
      locale,
      Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))),
    ]),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
