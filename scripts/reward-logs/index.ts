import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decode, recoverKey } from "./decode";
import { parseBattles, type Battle } from "./parse";

/**
 * Pulls the in-battle rewards out of this machine's War Thunder logs, as
 * samples to calibrate what a destroyed base pays (see TODOBYDEV). Local only —
 * it reads the game's own log folder, and nothing it finds is meant for the
 * repository: a raw log holds IP addresses, session tokens and other players'
 * names. The samples land in .cache/reward-samples.json, git-ignored.
 *
 * Only Air RB is kept: Nuclear Escalation and ground or naval battles pay by
 * other rules altogether.
 *
 *   npm run reward-logs [-- --dir <folder with .clog files>]
 */
const dirArg = process.argv.indexOf("--dir");
const LOG_DIR =
  dirArg > 0 ? process.argv[dirArg + 1] : path.join(os.homedir(), "AppData", "Local", "WarThunder", ".game_logs");
const OUT = path.join(process.cwd(), ".cache", "reward-samples.json");
const MODE = "air_realistic";

/** A base pays for damage dealt to it (17) and for destroying it (3), with no kill-feed line. */
const BASE_DAMAGE = 17;
const BASE_DESTROYED = 3;

async function main() {
  if (!existsSync(LOG_DIR)) throw new Error(`no game logs at ${LOG_DIR} — pass --dir`);
  const files = (await readdir(LOG_DIR)).filter((file) => file.endsWith(".clog")).sort();

  const battles: (Battle & { file: string })[] = [];
  for (const file of files) {
    const data = new Uint8Array(await readFile(path.join(LOG_DIR, file)));
    const log = decode(data, recoverKey(data));
    for (const battle of parseBattles(log)) {
      if (battle.mode === MODE && battle.events.length > 0) battles.push({ ...battle, file });
    }
  }

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(battles, null, 1));

  const events = battles.flatMap((b) => b.events);
  console.log(`${files.length} logs, ${battles.length} Air RB battles, ${events.length} reward events → ${path.relative(process.cwd(), OUT)}`);

  // Per aircraft and preset: bases destroyed, and what their damage paid.
  const tally = new Map<string, { destroyed: number; damageSl: number }>();
  for (const event of events) {
    const destroyed = event.type === BASE_DESTROYED && event.messages.length === 0;
    if (event.type !== BASE_DAMAGE && !destroyed) continue;
    const key = `${event.unit} / ${event.preset}`;
    const row = tally.get(key) ?? { destroyed: 0, damageSl: 0 };
    if (destroyed) row.destroyed++;
    else row.damageSl += event.sl;
    tally.set(key, row);
  }
  console.log("Bases by aircraft / preset:");
  for (const [key, row] of [...tally].sort((a, b) => b[1].destroyed - a[1].destroyed)) {
    console.log(`  ${key}: ${row.destroyed} destroyed, ${row.damageSl} SL for damage`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
