import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bombsNeeded } from "../../src/domain/base-hp";
import { BASE_BLEED, BASE_HP_BRACKETS, BASE_HP_TIERS, THREE_BASE_HP } from "../../src/domain/constants";
import type { Bomb } from "../../src/domain/types";
import { fireOf, hpBands, levelOfBr, type HpBand } from "./parse";

/**
 * Reads base hitpoints out of the game's own mission templates and checks
 * the site's constants against them, writing src/data/base-hp.json for the
 * test suite to hold the two together.
 *
 * - Four-base maps: `enduring_confrontation/bdt_bases_destroy_template.blk`,
 *   six bands of balance level — the same six the sheet reverse-engineered.
 * - Three-base maps: `destroy_bomb_areas_template.blk`, with its own arcade
 *   multiplier per band.
 *
 * Also reports what taking the base's burn-out share from the template
 * (`hpFireMult`: the base burns down once it is left with that share) would
 * change against the sheet's measured bleed — without changing it: what
 * `hpFireMult` means exactly is not written down anywhere.
 *
 *   npm run bases [-- --cache]
 */
const RAW = "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/mis.vromfs.bin_u/gamedata/missions/templates";
const TEMPLATES = {
  four: "enduring_confrontation/bdt_bases_destroy_template.blkx",
  three: "destroy_bomb_areas_template.blkx",
};
const CACHE_DIR = path.join(process.cwd(), ".cache", "bases");
const DATA = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA, "base-hp.json");

const useCache = process.argv.includes("--cache");

async function loadTemplate(file: string): Promise<Record<string, unknown>> {
  const cached = path.join(CACHE_DIR, path.basename(file).replace(/\.blkx$/, ".json"));
  if (useCache && existsSync(cached)) return JSON.parse(await readFile(cached, "utf8"));
  const response = await fetch(`${RAW}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cached, JSON.stringify(body), "utf8");
  return body;
}

async function main() {
  const four = hpBands(await loadTemplate(TEMPLATES.four), "bdt_base_hp");
  const threeTemplate = await loadTemplate(TEMPLATES.three);
  const three = hpBands(threeTemplate, "baseHP", "arcade_HP_mul");
  const fire = fireOf(threeTemplate);
  if (four.length === 0 || three.length === 0 || !fire) throw new Error("a template no longer reads as expected");

  await writeFile(OUT, JSON.stringify({ four, three, fire }, null, 1));
  console.log(`Four-base maps: ${four.map((b) => b.hp).join(" / ")} HP`);
  console.log(`Three-base maps: ${three.map((b) => `${b.hp} (arcade ×${b.arcadeMul})`).join(" / ")}`);

  // The site's own constants, band by band.
  const problems: string[] = [];
  const bandAt = (bands: HpBand[], br: number) =>
    bands.find((band) => band.maxLevel === null || levelOfBr(br) <= band.maxLevel)!;
  for (const bracket of BASE_HP_BRACKETS) {
    const br = Number.isFinite(bracket.maxBr) ? bracket.maxBr : 14;
    const game = bandAt(four, br);
    if (game.hp !== bracket.hp) problems.push(`four bases up to BR ${bracket.maxBr}: site ${bracket.hp}, game ${game.hp}`);
    const threeGame = bandAt(three, br);
    const site = THREE_BASE_HP[bracket.hp];
    if (threeGame.hp !== site.hp || threeGame.arcadeMul !== site.arcadeMul) {
      problems.push(
        `three bases up to BR ${bracket.maxBr}: site ${site.hp} ×${site.arcadeMul}, game ${threeGame.hp} ×${threeGame.arcadeMul}`,
      );
    }
  }
  // Reported, not fatal: base-hp.json is written either way and base-hp.test.ts
  // fails on the difference, so the daily import still opens its pull request.
  console.log(problems.length === 0 ? "ok    the site's base HP matches the game's templates" : "FAIL  base HP differs:");
  for (const line of problems) console.log(`        ${line}`);

  // What the template's burn-out share would change against the measured bleed.
  const bombs = JSON.parse(await readFile(path.join(DATA, "bombs.json"), "utf8")) as Bomb[];
  const templateBleed = 1 - fire.hpFireMult;
  let compared = 0;
  const differ: string[] = [];
  for (const bomb of bombs) {
    if (!bomb.damageValue) continue;
    for (const hp of BASE_HP_TIERS) {
      compared++;
      const sheet = bombsNeeded(hp, bomb.damageValue);
      const game = Math.ceil((hp * templateBleed) / bomb.damageValue);
      if (sheet !== game) differ.push(`${bomb.chartName || bomb.fullName} @ ${hp}: ${sheet} → ${game}`);
    }
  }
  console.log(
    `Bleed: the sheet's ${BASE_BLEED} against the template's 1 − hpFireMult = ${templateBleed}: ` +
      `${differ.length} of ${compared} bombs-per-base counts would change (not applied)`,
  );
  for (const line of differ.slice(0, 12)) console.log(`        ${line}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
