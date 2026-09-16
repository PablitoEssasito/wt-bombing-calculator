import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft } from "../../src/domain/types";
import { parseMountStyle, type MountStyle } from "./parse";

const UNIT_PAGE = (unitId: string) => `https://wiki.warthunder.com/unit/${unitId}`;

const DATA_DIR = path.join(process.cwd(), "src", "data");
const OUT_DATA = path.join(DATA_DIR, "mounts.json");
/**
 * Only the verdict is cached, not the page it came from.
 *
 * Each unit page is a couple of hundred kilobytes and all we keep is one word, so
 * caching the parse instead of the HTML keeps this to a few kilobytes. The cost is
 * that changing the parser means deleting this file and pulling the pages again.
 */
const CACHE = path.join(process.cwd(), ".cache", "mounts.json");

/** The wiki is a courtesy, not an API. */
const DELAY_MS = 120;

const useCache = process.argv.includes("--cache");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const aircraft = JSON.parse(
    await readFile(path.join(DATA_DIR, "aircraft.json"), "utf8"),
  ) as Aircraft[];
  const wikiUnits = await readJson<Record<string, string>>(
    path.join(DATA_DIR, "images.json"),
    {},
  );

  const cached = useCache ? await readJson<Record<string, MountStyle>>(CACHE, {}) : {};
  console.log(
    useCache
      ? `Using ${Object.keys(cached).length} cached verdicts; fetching the rest`
      : "Fetching every unit page from the wiki",
  );

  const verdicts: Record<string, MountStyle> = { ...cached };
  const mounts: Record<string, MountStyle> = {};
  const noUnit: string[] = [];
  const unreadable: string[] = [];
  let fetched = 0;

  for (const plane of aircraft) {
    const unitId = wikiUnits[plane.id];
    if (!unitId) {
      noUnit.push(plane.name);
      continue;
    }

    if (!(unitId in verdicts)) {
      const response = await fetch(UNIT_PAGE(unitId), {
        headers: { "user-agent": "Mozilla/5.0" },
      });
      fetched++;
      if (response.ok) {
        const style = parseMountStyle(await response.text());
        if (style) verdicts[unitId] = style;
      }
      await sleep(DELAY_MS);
      if (fetched % 50 === 0) console.log(`  ${fetched} pages fetched...`);
    }

    const style = verdicts[unitId];
    if (style) mounts[plane.id] = style;
    else unreadable.push(`${plane.name} (${unitId})`);
  }

  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(verdicts), "utf8");
  await writeFile(OUT_DATA, JSON.stringify(mounts), "utf8");

  const pylons = Object.values(mounts).filter((m) => m === "pylons").length;
  const setups = Object.values(mounts).filter((m) => m === "setups").length;

  console.log(`\nFetched ${fetched} page(s)`);
  console.log(`  ${pylons} aircraft mount ordnance per pylon — a part of a load can be taken`);
  console.log(`  ${setups} offer fixed setups only — all of it or none`);
  if (noUnit.length > 0) {
    console.log(`  ${noUnit.length} have no wiki unit matched: ${noUnit.slice(0, 5).join(", ")}`);
  }
  if (unreadable.length > 0) {
    console.log(`  ${unreadable.length} page(s) stated no suspended armament we could read:`);
    for (const p of unreadable.slice(0, 10)) console.log(`        ${p}`);
    if (unreadable.length > 10) console.log(`        ... and ${unreadable.length - 10} more`);
  }
  console.log(`\nWrote ${Object.keys(mounts).length} entries to src/data/mounts.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
