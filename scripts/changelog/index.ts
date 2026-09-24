import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChangelogEntry, Meta } from "../../src/domain/types";
import { diffData, mergeEntries, type DataSnapshot } from "./diff";

/**
 * Adds what the latest import changed to src/data/changelog.json.
 *
 * Runs last, after etl → stores → armament → bomb-icons → battle-ratings
 * (armament rewrites bombs.json, battle-ratings aircraft.json), and compares
 * the data now on disk against the last commit of it — the previous import is
 * simply what git already holds, so nothing else needs keeping. Entries already
 * committed are left as they are, except that an import within the same patch
 * folds into that patch's entry; the entry is rewritten on every run until it
 * is committed.
 *
 * `--since <ref>` compares against another commit instead of HEAD. The entry
 * is labelled with the game patch the datamine is at, dated the day it went
 * live — the datamine commits each patch under its own number, within hours
 * of release. `--game-version <v>` sets the patch by hand, for an offline run.
 */
const DATAMINE = "gszabi99/War-Thunder-Datamine";
const VERSION_URL = `https://raw.githubusercontent.com/${DATAMINE}/master/version`;
const VERSION_COMMITS_URL = `https://api.github.com/repos/${DATAMINE}/commits?path=version&per_page=100`;
const DATA = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA, "changelog.json");

const sinceFlag = process.argv.indexOf("--since");
const since = sinceFlag >= 0 ? process.argv[sinceFlag + 1] : "HEAD";
const versionFlag = process.argv.indexOf("--game-version");

/** The day the datamine first shipped this version — close enough to its release to date it by. */
async function releaseDate(version: string): Promise<string | null> {
  try {
    const response = await fetch(VERSION_COMMITS_URL);
    if (!response.ok) return null;
    type Commit = { commit: { message: string; committer: { date: string } } };
    const commits = (await response.json()) as Commit[];
    const commit = commits.find((c) => c.commit.message.trim().split(/\s/)[0] === version);
    return commit ? commit.commit.committer.date.slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function gameVersion(): Promise<string | null> {
  if (versionFlag >= 0) return process.argv[versionFlag + 1];
  try {
    const response = await fetch(VERSION_URL);
    return response.ok ? (await response.text()).trim() : null;
  } catch {
    return null;
  }
}

const atRef = <T>(ref: string, file: string): T | null => {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${ref}:src/data/${file}`], {
        encoding: "utf8",
        maxBuffer: 1 << 28,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as T;
  } catch {
    return null;
  }
};

async function main() {
  const read = async <T>(file: string) => JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;
  const now: DataSnapshot = { aircraft: await read("aircraft.json"), bombs: await read("bombs.json") };
  const meta = await read<Meta>("meta.json");

  const aircraft = atRef<DataSnapshot["aircraft"]>(since, "aircraft.json");
  const bombs = atRef<DataSnapshot["bombs"]>(since, "bombs.json");
  if (!aircraft || !bombs) throw new Error(`No data committed at ${since} to compare against`);

  const committed = atRef<ChangelogEntry[]>("HEAD", "changelog.json") ?? [];
  const version = await gameVersion();
  const released = version ? await releaseDate(version) : null;
  if (!version) console.log("note  could not read the game version — the entry goes unlabelled");
  else if (!released) console.log(`note  could not find when ${version} went live — dated by the import instead`);
  const diff = diffData({ aircraft, bombs }, now, {
    date: released ?? meta.generatedAt.slice(0, 10),
    gameVersion: version,
  });
  // A second import within one patch folds into that patch's entry.
  const [latest, ...older] = committed;
  const samePatch = diff && latest && version && latest.gameVersion === version;
  const entry = samePatch ? mergeEntries(latest, diff) : diff;
  const history = samePatch ? older : committed;
  await writeFile(OUT, JSON.stringify(entry ? [entry, ...history] : history, null, 1));

  if (!entry) {
    console.log(`No changes since ${since} — changelog left at ${committed.length} entries`);
    return;
  }
  const { aircraft: a, bombs: b } = entry;
  console.log(`Changes since ${since} (patch ${entry.gameVersion ?? "?"}, ${entry.date}):`);
  console.log(`  aircraft  +${a.added.length} −${a.removed.length}, BR ${a.br.length}, loadouts ${a.loadouts.length}`);
  console.log(`  bombs     +${b.added.length} −${b.removed.length}, values ${b.changed.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
