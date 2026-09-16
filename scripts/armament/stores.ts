import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RAW =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/aces.vromfs.bin_u/gamedata";

const ARMAMENT_DIR = path.join(process.cwd(), ".cache", "armament");
const UNITS_DIR = path.join(ARMAMENT_DIR, "raw");
const STORES_DIR = path.join(ARMAMENT_DIR, "stores");
const OUT = path.join(ARMAMENT_DIR, "stores.json");

const CONCURRENCY = 10;

/** What a hardpoint is carrying, coarsely — the grouping the game's own menu uses. */
export type StoreKind =
  | "bomb"
  | "mine"
  | "torpedo"
  | "rocket"
  | "missile"
  | "gun"
  | "tank"
  | "pod"
  | "countermeasure"
  | "other";

export type Store = {
  /** File basename, the key hardpoint options refer to. */
  file: string;
  massKg: number | null;
  kind: StoreKind;
};

const many = <T,>(value: unknown): T[] =>
  value === undefined || value === null ? [] : ((Array.isArray(value) ? value : [value]) as T[]);

export const storeFile = (blkReference: string) =>
  blkReference.split("/").pop()!.replace(/\.blkx?$/i, "").toLowerCase();

/** `gameData/Weapons/rocketGuns/us_aim9m.blk` is served as `weapons/rocketguns/us_aim9m.blkx`. */
export const storePath = (blkReference: string) =>
  blkReference.replace(/^gameData\//i, "").toLowerCase().replace(/\.blkx?$/i, ".blkx");

/**
 * Sorts a store into the group the loadout menu would file it under.
 *
 * The directory decides most of it, since the game keeps bombs, rockets and drop
 * tanks apart already. Within rocketguns the two that matter are told apart by
 * whether the file describes guidance, which is what separates an AIM-9 from a
 * plain HVAR.
 */
export function classify(reference: string, body: Record<string, unknown>): StoreKind {
  const dir = reference.toLowerCase();
  const payload = (body.rocket ?? body.bomb ?? body.torpedo ?? {}) as Record<string, unknown>;

  if (dir.includes("/bombguns/")) return "bomb";
  if (dir.includes("/mines/")) return "mine";
  if (dir.includes("/torpedoes/")) return "torpedo";
  if (dir.includes("/drop_tank/")) return "tank";
  if (dir.includes("/containers/")) return "pod";
  if (dir.includes("/rocketguns/")) {
    if (/countermeasure|flare|chaff/.test(dir)) return "countermeasure";
    return payload.guidance != null || body.guidance != null ? "missile" : "rocket";
  }
  if (/^weapons\/(cannon|gun|mg)/.test(dir) || /cannon|gun/.test(dir.split("/").pop() ?? "")) {
    return "gun";
  }
  return "other";
}

/** What a store weighs on its own, before anything it might be holding. */
function ownMass(body: Record<string, unknown>): number | null {
  const warhead = (body.rocket ?? body.bomb ?? body.torpedo ?? {}) as Record<string, unknown>;
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  for (const candidate of [warhead.mass, body.mass, payload.mass]) {
    if (typeof candidate === "number") return candidate;
  }
  return null;
}

/** The file a launch rail or rack points at, and how many of them it holds. */
export function contained(body: Record<string, unknown>): { blk: string; count: number } | null {
  if (body.container !== true || typeof body.blk !== "string") return null;
  return { blk: body.blk, count: typeof body.bullets === "number" ? body.bullets : 1 };
}

/**
 * Weighs a store, following a rail or rack to whatever it carries.
 *
 * A third of the stores state no mass of their own because they are not stores at
 * all: `aero_3b_aim9b` is a rail that holds two AIM-9Bs and says so by pointing at
 * the missile's file. What the wing carries is the missiles, so that is what gets
 * counted — the rail's own weight is not in the data anywhere.
 */
function massOfStore(
  file: string,
  bodies: Map<string, Record<string, unknown>>,
  seen = new Set<string>(),
): number | null {
  const body = bodies.get(file);
  if (!body || seen.has(file)) return null;
  seen.add(file);

  const own = ownMass(body);
  if (own !== null) return own;

  const inner = contained(body);
  if (!inner) return null;
  const innerMass = massOfStore(storeFile(inner.blk), bodies, seen);
  return innerMass === null ? null : innerMass * inner.count;
}

/** Every distinct weapon file the hardpoints of any aircraft can hang. */
async function referenced(): Promise<Map<string, string>> {
  const byFile = new Map<string, string>();
  for (const name of await readdir(UNITS_DIR)) {
    const raw = JSON.parse(await readFile(path.join(UNITS_DIR, name), "utf8")) as {
      fm: { WeaponSlots?: { WeaponSlot?: unknown } };
    };
    for (const slot of many<Record<string, unknown>>(raw.fm.WeaponSlots?.WeaponSlot)) {
      if (Number(slot.index) <= 0) continue;
      for (const preset of many<Record<string, unknown>>(slot.WeaponPreset)) {
        for (const weapon of many<Record<string, unknown>>(preset.Weapon)) {
          if (typeof weapon.blk === "string") byFile.set(storeFile(weapon.blk), weapon.blk);
        }
      }
    }
  }
  return byFile;
}

async function main() {
  const useCache = process.argv.includes("--cache");
  const hung = await referenced();
  console.log(`${hung.size} distinct stores hang from hardpoints across the roster`);

  await mkdir(STORES_DIR, { recursive: true });

  const bodies = new Map<string, Record<string, unknown>>();
  const references = new Map(hung);
  const missing: string[] = [];
  let queue = [...hung.entries()];
  let done = 0;

  async function fetchOne([file, reference]: [string, string]) {
    const cachePath = path.join(STORES_DIR, `${file}.json`);
    if (useCache && existsSync(cachePath)) {
      bodies.set(file, JSON.parse(await readFile(cachePath, "utf8")) as Record<string, unknown>);
      return;
    }
    const response = await fetch(`${RAW}/${storePath(reference)}`);
    if (!response.ok) return void missing.push(file);
    try {
      const body = (await response.json()) as Record<string, unknown>;
      await writeFile(cachePath, JSON.stringify(body), "utf8");
      bodies.set(file, body);
    } catch {
      missing.push(file);
    }
  }

  // Rails point at the missiles they hold, which need not be hung anywhere
  // themselves, so keep pulling until nothing new is referenced.
  while (queue.length > 0) {
    const batch = queue;
    queue = [];
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map(fetchOne));
      done += Math.min(CONCURRENCY, batch.length - i);
      if (done % 200 < CONCURRENCY) console.log(`  ${done} read...`);
    }
    for (const body of bodies.values()) {
      const inner = contained(body);
      if (!inner) continue;
      const innerFile = storeFile(inner.blk);
      if (!references.has(innerFile)) {
        references.set(innerFile, inner.blk);
        queue.push([innerFile, inner.blk]);
      }
    }
  }

  const stores: Store[] = [];
  for (const [file, reference] of hung) {
    const body = bodies.get(file);
    if (!body) continue;
    const inner = contained(body);
    // A rail is filed under what it holds, the way the loadout menu lists it.
    const kindSource = inner ? bodies.get(storeFile(inner.blk)) : null;
    const kindRef = inner && kindSource ? storePath(inner.blk) : storePath(reference);
    stores.push({
      file,
      massKg: massOfStore(file, bodies),
      kind: classify(kindRef, kindSource ?? body),
    });
  }

  stores.sort((a, b) => a.file.localeCompare(b.file));
  await writeFile(OUT, JSON.stringify(stores), "utf8");

  const byKind = new Map<StoreKind, number>();
  for (const s of stores) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
  const weighed = stores.filter((s) => s.massKg !== null).length;

  console.log(`\nread ${stores.length} stores, ${weighed} of them weighed`);
  console.log(
    "  " + [...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(", "),
  );
  const noMass = stores.filter((s) => s.massKg === null);
  if (noMass.length > 0) {
    console.log(
      `warn  ${noMass.length} store(s) state no mass anywhere: ` +
        noMass.slice(0, 8).map((s) => s.file).join(", "),
    );
  }
  if (missing.length > 0) {
    console.log(`warn  ${missing.length} store file(s) could not be fetched: ${missing.slice(0, 6).join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
