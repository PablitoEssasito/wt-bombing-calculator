import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bombsNeeded } from "../../src/domain/base-hp";
import { BASE_BLEED, BASE_HP_TIERS, NATIONS } from "../../src/domain/constants";
import type { Aircraft, Meta } from "../../src/domain/types";
import { BOMB_CHART_NATION_ORDER, NATION_TABS, SOURCE_URL, TABS } from "./config";
import { loadEnv, sheetsApiKey } from "./env";
import { fetchTab } from "./fetch";
import { parseBombs, type BombIndex } from "./parse-bombs";
import { parseNation, type UnresolvedName } from "./parse-nations";
import { fetchSheetTitles, loadNotes, type NoteGrid } from "./notes";
import { parseCsv } from "./csv";

const OUT_DIR = path.join(process.cwd(), "src", "data");

const useCache = process.argv.includes("--cache");

async function main() {
  loadEnv();
  console.log(useCache ? "Using cached CSV where available" : "Fetching sheet");
  console.log(
    sheetsApiKey()
      ? "Sheets API key found\n"
      : "No Sheets API key set — cell notes will be skipped (see .env.local)\n",
  );

  const index = parseBombs(await fetchTab(TABS.bombChart, useCache));
  const { bombs } = index;
  console.log(
    `Bomb chart: ${bombs.length} entries in ${index.nationBlocks} nation blocks, ` +
      `${index.global.normalized.size} shared names, ${index.ambiguous.size} nation-specific`,
  );

  const key = sheetsApiKey();
  const titles = key ? await fetchSheetTitles(key) : null;

  const aircraft: Aircraft[] = [];
  const unresolved: UnresolvedName[] = [];
  const orphanRows: string[] = [];
  const nationNotes: Record<string, string> = {};
  const misaligned: string[] = [];
  let noteCount = 0;

  for (const nation of NATIONS) {
    const csv = await fetchTab(NATION_TABS[nation], useCache);

    let notes: NoteGrid | null = null;
    if (key && titles) {
      const title = titles.get(NATION_TABS[nation]);
      notes = title ? await loadNotes(title, parseCsv(csv), key, useCache) : null;
      if (title && notes === null) misaligned.push(nation);
      noteCount += notes?.size ?? 0;
    }

    const result = parseNation(csv, nation, index, notes);
    if (result.nationNote) nationNotes[nation] = result.nationNote;
    aircraft.push(...result.aircraft);
    unresolved.push(...result.unresolved);
    orphanRows.push(...result.orphanRows);

    const options = result.aircraft.reduce((n, a) => n + a.options.length, 0);
    const schedules = result.aircraft.reduce(
      (n, a) => n + a.options.reduce((m, o) => m + o.schedules.length, 0),
      0,
    );
    console.log(
      `  ${nation.padEnd(8)} ${String(result.aircraft.length).padStart(3)} aircraft, ` +
        `${String(options).padStart(4)} loadouts, ${String(schedules).padStart(4)} schedules`,
    );
  }

  const meta: Meta = {
    sourceUrl: SOURCE_URL,
    nationNotes,
    hasNotes: noteCount > 0,
    sheetVersion: await readSheetVersion(),
    generatedAt: new Date().toISOString(),
    aircraftCount: aircraft.length,
    bombCount: bombs.length,
  };

  if (key) {
    console.log(
      `\nCell notes: ${noteCount} imported` +
        (misaligned.length > 0
          ? `, skipped for ${misaligned.join(", ")} — the API and CSV grids no longer line up`
          : ""),
    );
  }

  const problems = validate(index, aircraft, unresolved, orphanRows);

  // usedByNations starts empty here (see scripts/etl/parse-bombs.ts and
  // aliases.ts) — `npm run armament` fills it in once it has both the sheet's
  // own schedules and the game's hardpoint data to read, and overwrites this
  // file again. See usedByNationsOf in scripts/armament/index.ts.
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "bombs.json"), JSON.stringify(bombs));
  await writeFile(path.join(OUT_DIR, "aircraft.json"), JSON.stringify(aircraft));
  await writeFile(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(`\nWrote ${aircraft.length} aircraft and ${bombs.length} bombs to src/data`);

  if (problems > 0) {
    console.error(`\n${problems} blocking problem(s) — data was written, but fix these.`);
    process.exit(1);
  }
}

async function readSheetVersion(): Promise<string | null> {
  const csv = await fetchTab(TABS.changelog, useCache);
  return csv.match(/\b(\d+\.\d+)\b/)?.[1] ?? null;
}

function validate(
  index: BombIndex,
  aircraft: Aircraft[],
  unresolved: UnresolvedName[],
  orphanRows: string[],
): number {
  const bombs = index.bombs;
  let blocking = 0;

  console.log("\n--- validation ---");

  if (unresolved.length > 0) {
    blocking++;
    const grouped = new Map<string, number>();
    for (const u of unresolved) grouped.set(u.name, (grouped.get(u.name) ?? 0) + 1);
    console.error(`FAIL  ${unresolved.length} unresolved bomb name(s):`);
    for (const [name, count] of [...grouped].sort((a, b) => b[1] - a[1])) {
      const example = unresolved.find((u) => u.name === name)!;
      const clash = example.candidates ? ` — ambiguous between ${example.candidates.join(", ")}` : "";
      console.error(`        ${name} x${count}  (e.g. ${example.nation}/${example.aircraft})${clash}`);
    }
  } else {
    console.log("ok    every loadout entry resolves to a known bomb");
  }

  if (orphanRows.length > 0) {
    blocking++;
    console.error(`FAIL  ${orphanRows.length} schedule row(s) with no aircraft to attach to`);
  }

  if (index.nationBlocks !== BOMB_CHART_NATION_ORDER.length) {
    blocking++;
    console.error(
      `FAIL  found ${index.nationBlocks} nation blocks in the bomb chart, expected ` +
        `${BOMB_CHART_NATION_ORDER.length} — the tab's ordering changed and bombs are ` +
        "being attributed to the wrong nations",
    );
  } else {
    console.log(`ok    bomb chart splits into ${index.nationBlocks} nation blocks`);
  }

  /**
   * Second opinion on the nation blocks, from who actually carries the bombs.
   *
   * The chart marks its nations with flag images, which no anonymous export
   * carries, so the blocks are recovered from the damage column instead. This
   * checks that answer against usage: aircraft overwhelmingly carry their own
   * nation's ordnance, so if a boundary slipped, some block would be dominated by
   * a nation other than the one it was assigned to. Cross-nation use is normal and
   * expected — Chinese aircraft on Soviet bombs, Swedish on German — so only the
   * most frequent user has to match.
   */
  const blockOf = new Map<string, string>();
  for (const nation of NATIONS) {
    for (const id of index.byNation.get(nation)?.normalized.values() ?? []) {
      blockOf.set(id, nation);
    }
  }

  const usageByBlock = new Map<string, Map<string, number>>();
  for (const plane of aircraft) {
    for (const option of plane.options) {
      for (const schedule of option.schedules) {
        for (const base of schedule.bases) {
          for (const item of base.items) {
            const block = blockOf.get(item.bombId);
            if (!block) continue;
            const tally = usageByBlock.get(block) ?? new Map<string, number>();
            tally.set(plane.nation, (tally.get(plane.nation) ?? 0) + 1);
            usageByBlock.set(block, tally);
          }
        }
      }
    }
  }

  const misattributed = [...usageByBlock].flatMap(([block, tally]) => {
    const [topNation, topCount] = [...tally].sort((a, b) => b[1] - a[1])[0];
    const own = tally.get(block) ?? 0;
    return topNation === block
      ? []
      : [`${block} block is carried mostly by ${topNation} (${topCount} vs ${own})`];
  });

  if (misattributed.length > 0) {
    blocking++;
    console.error("FAIL  nation blocks disagree with who carries the bombs:");
    for (const m of misattributed) console.error(`        ${m}`);
  } else {
    console.log("ok    every nation block is carried mostly by its own nation");
  }

  if (index.ambiguous.size > 0) {
    console.log(
      `ok    ${index.ambiguous.size} name(s) resolved per nation rather than globally: ` +
        [...index.ambiguous.keys()].join(", "),
    );
  }

  // The sheet states a reward multiplier for nearly every loadout; the ones it
  // skips are worth knowing about, but they are omissions in the source rather
  // than something we can derive.
  const missingMultiplier = aircraft.flatMap((plane) =>
    plane.options.flatMap((option, i) =>
      option.rewardMultiplier === null ? [`${plane.nation}/${plane.name} loadout ${i + 1}`] : [],
    ),
  );
  if (missingMultiplier.length > 0) {
    console.log(`note  ${missingMultiplier.length} loadout(s) carry no reward multiplier in the source:`);
    for (const p of missingMultiplier.slice(0, 8)) console.log(`        ${p}`);
  } else {
    console.log("ok    every loadout states a reward multiplier");
  }

  /**
   * How much of the author's own judgement we managed to read.
   *
   * Both figures drive which loadout the planner offers first, and both come from
   * prose rather than a column, so a reworded sheet could quietly drop to zero
   * without anything else failing. Printing them makes that obvious at import.
   */
  const starred = aircraft.filter((p) => p.options.some((o) => o.noteMarker === "star")).length;
  const discouraged = aircraft.flatMap((plane) =>
    plane.options.flatMap((option, i) =>
      option.discouraged ? [`${plane.nation}/${plane.name} loadout ${i + 1}`] : [],
    ),
  );
  console.log(
    `note  the source stars a loadout on ${starred} aircraft and argues against ` +
      `${discouraged.length} loadout(s) in its notes`,
  );
  for (const p of discouraged.slice(0, 8)) console.log(`        ${p}`);
  if (discouraged.length > 8) console.log(`        ... and ${discouraged.length - 8} more`);

  // A continuation schedule describes the same bombs in a higher-BR match, so it
  // must not restate a target count of its own.
  const restated = aircraft.flatMap((plane) =>
    plane.options.flatMap((option, i) =>
      option.schedules.slice(1).some((s) => s.basesDestroyed !== null)
        ? [`${plane.nation}/${plane.name} loadout ${i + 1}`]
        : [],
    ),
  );
  if (restated.length > 0) {
    blocking++;
    console.error(`FAIL  ${restated.length} continuation schedule(s) restate a target count — grouping is wrong`);
    for (const p of restated.slice(0, 8)) console.error(`        ${p}`);
  } else {
    console.log("ok    loadouts group cleanly into schedules");
  }

  // The formula has to reproduce the counts printed in the source chart exactly.
  let checked = 0;
  const mismatches: string[] = [];
  for (const bomb of bombs) {
    if (!bomb.sheetCounts || bomb.damageValue === null) continue;
    BASE_HP_TIERS.forEach((hp, i) => {
      checked++;
      const ours = bombsNeeded(hp, bomb.damageValue!);
      if (ours !== bomb.sheetCounts![i]) {
        mismatches.push(
          `${bomb.chartName || bomb.fullName} @ ${hp}: sheet ${bomb.sheetCounts![i]}, ours ${ours}`,
        );
      }
    });
  }
  if (mismatches.length > 0) {
    blocking++;
    console.error(`FAIL  formula disagrees with the source chart in ${mismatches.length}/${checked} cells:`);
    for (const m of mismatches.slice(0, 10)) console.error(`        ${m}`);
  } else {
    console.log(`ok    formula reproduces all ${checked} printed counts`);
  }

  // Every base the sheet counts as destroyed should carry enough damage to do it.
  const damageById = new Map(bombs.map((b) => [b.id, b.damageValue]));
  let verified = 0;
  let skipped = 0;
  const short: string[] = [];

  for (const plane of aircraft) {
    for (const option of plane.options) {
      for (const schedule of option.schedules) {
        if (schedule.basesDestroyed === null) continue;
        const threshold = schedule.baseHp * BASE_BLEED;

        schedule.bases.slice(0, schedule.basesDestroyed).forEach((base, i) => {
          let total = 0;
          for (const item of base.items) {
            const damage = damageById.get(item.bombId);
            // Rockets and the few bombs missing from the chart carry no figure,
            // so the base cannot be checked at all.
            if (damage == null) {
              skipped++;
              return;
            }
            total += damage * item.count;
          }

          verified++;
          if (total < threshold) {
            const pct = Math.round((total / threshold) * 100);
            short.push(
              `${plane.nation}/${plane.name} base ${i + 1}: ${Math.round(total)} vs ` +
                `${Math.round(threshold)} needed (${pct}%, ${schedule.baseHp} HP base)`,
            );
          }
        });
      }
    }
  }
  const verdict = short.length === 0 ? "ok   " : "warn ";
  console.log(
    `${verdict} ${verified} destroyed bases cross-checked, ${short.length} fall short, ` +
      `${skipped} skipped (unpriced ordnance)`,
  );
  for (const s of short.slice(0, 15)) console.log(`        ${s}`);
  if (short.length > 15) console.log(`        ... and ${short.length - 15} more`);

  return blocking;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
