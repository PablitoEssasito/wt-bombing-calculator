import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Aircraft } from "../../src/domain/types";
import { matchAircraft, parseUnitList, type WikiUnit } from "./match";

const WIKI_INDEX = "https://wiki.warthunder.com/aviation";
/** The encyclopedia's full render: 512x256, the aircraft alone on transparency. */
const RENDER = (id: string) => `https://static.encyclopedia.warthunder.com/images/${id}.png`;
/** The small tech-tree slot icon — what the source spreadsheet itself used. */
const ICON = (id: string) => `https://static.encyclopedia.warthunder.com/slots/${id}.png`;

const OUT_RENDERS = path.join(process.cwd(), "public", "aircraft", "renders");
const OUT_ICONS = path.join(process.cwd(), "public", "aircraft", "icons");
const OUT_DATA = path.join(process.cwd(), "src", "data", "images.json");
const CACHE = path.join(process.cwd(), ".cache", "wiki-aviation.html");

const useCache = process.argv.includes("--cache");

async function loadUnits(): Promise<WikiUnit[]> {
  if (useCache && existsSync(CACHE)) return parseUnitList(await readFile(CACHE, "utf8"));

  const response = await fetch(WIKI_INDEX, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Wiki index: HTTP ${response.status}`);
  const html = await response.text();

  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, html, "utf8");
  return parseUnitList(html);
}

/**
 * Downloads one image and re-encodes it as WebP without resizing.
 *
 * Both sources are already the size they need to be — the render is 512x256, the
 * icon a tiny 122x66 — so the only thing sharp does here is switch container.
 * Quality 95 is close enough to lossless that re-encoding twice (once here, once
 * if the source is ever re-fetched) will not show, while still cutting the PNG's
 * size by two thirds or more.
 */
async function fetchAsWebp(url: string, outFile: string): Promise<boolean> {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) return false;
  const source = Buffer.from(await response.arrayBuffer());
  await sharp(source).webp({ quality: 95 }).toFile(outFile);
  return true;
}

async function main() {
  const aircraft = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "aircraft.json"), "utf8"),
  ) as Aircraft[];

  const units = await loadUnits();
  console.log(`Wiki lists ${units.length} units`);

  const { matches, unmatched } = matchAircraft(aircraft, units);
  const byMethod = new Map<string, number>();
  for (const { method } of matches.values()) {
    byMethod.set(method, (byMethod.get(method) ?? 0) + 1);
  }
  console.log(
    `Matched ${matches.size}/${aircraft.length} ` +
      `(${[...byMethod].map(([m, n]) => `${m} ${n}`).join(", ")})`,
  );
  if (unmatched.length > 0) {
    console.log(`No wiki entry for ${unmatched.length}:`);
    for (const plane of unmatched) console.log(`   ${plane.nation}/${plane.name}`);
  }

  await mkdir(OUT_RENDERS, { recursive: true });
  await mkdir(OUT_ICONS, { recursive: true });

  const wanted = new Map<string, string>();
  for (const [aircraftId, match] of matches) wanted.set(aircraftId, match.unit.id);

  // Several of the sheet's aircraft can share one wiki unit, so fetch each once.
  const unitIds = [...new Set(wanted.values())];
  let done = 0;
  const failed: string[] = [];

  for (const unitId of unitIds) {
    const renderFile = path.join(OUT_RENDERS, `${unitId}.webp`);
    const iconFile = path.join(OUT_ICONS, `${unitId}.webp`);

    try {
      if (!existsSync(renderFile)) {
        const ok = await fetchAsWebp(RENDER(unitId), renderFile);
        if (!ok) throw new Error(`render: HTTP not ok for ${unitId}`);
      }
      if (!existsSync(iconFile)) {
        const ok = await fetchAsWebp(ICON(unitId), iconFile);
        if (!ok) throw new Error(`icon: HTTP not ok for ${unitId}`);
      }
      done++;
      if (done % 50 === 0) console.log(`   ${done}/${unitIds.length}…`);
    } catch (error) {
      failed.push(`${unitId}: ${(error as Error).message}`);
    }
  }

  console.log(`\nImages: ${done} complete, ${failed.length} failed`);
  for (const f of failed.slice(0, 10)) console.log(`   ${f}`);

  // Only keep aircraft whose pair of images actually landed on disk.
  const map: Record<string, string> = {};
  for (const [aircraftId, unitId] of wanted) {
    const hasBoth =
      existsSync(path.join(OUT_RENDERS, `${unitId}.webp`)) &&
      existsSync(path.join(OUT_ICONS, `${unitId}.webp`));
    if (hasBoth) map[aircraftId] = unitId;
  }
  await writeFile(OUT_DATA, JSON.stringify(map));
  console.log(`Wrote ${Object.keys(map).length} image references to src/data/images.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
