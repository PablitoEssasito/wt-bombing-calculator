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

const useCache = process.argv.includes("--cache");

/** The column each language's text sits in, by the header's own names. */
const COLUMN_OF = { pl: "Polish", ru: "Russian" } as const;

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
    armament.files.forEach((file, i) => {
      const store = armament.stores[i];
      const full = weaponNames.get(`weapons/${file}`);
      const short = weaponNames.get(`weapons/${file}/short`);
      if (store?.n && full?.translated && full.translated !== store.n) weapons[store.n] = full.translated;
      if (store?.s && short?.translated && short.translated !== store.s) weapons[store.s] = short.translated;
    });

    out[locale] = { aircraft: aircraftNames, weapons };
    console.log(
      `${locale}: ${Object.keys(aircraftNames).length}/${aircraft.length} aircraft named, ` +
        `${Object.keys(weapons).length} weapon names translated`,
    );
  }

  await writeFile(OUT, JSON.stringify(out));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
