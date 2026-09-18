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
  /** The game's own name for it, as the loadout menu shows it. */
  name: string | null;
  /** The shorter name the game uses where space is tight. */
  short: string | null;
  massKg: number | null;
  kind: StoreKind;
  /**
   * What this delivers in bomb-chart terms, so a build can be priced.
   *
   * A rack resolves to its contents with a count: `bru_3a_us_750lb_m117_x6` is
   * six M117s, and pricing it as one store would understate it sixfold. Null for
   * anything the chart does not cover — missiles, tanks, and the handful of
   * glide bombs it never catalogued.
   */
  bomb: { id: string; count: number } | null;
  /**
   * How many rounds this store comes to once every rack and rail is opened —
   * a twin R-60M rail holds two, a nineteen-tube pod holds nineteen, a bare
   * bomb holds one. Independent of whether the chart prices what is inside,
   * which is what lets a missile rail be counted at all.
   */
  holds: number;
  /**
   * Whether this file itself holds something else — a rack, a rail, a launcher
   * pod — as opposed to being ordnance in its own right.
   *
   * This is what tells a repeat count on a hardpoint choice apart from a round
   * count on a gun: only a container's own multiplier is a physical quantity.
   * See `isPhysicalCount`.
   */
  container: boolean;
};

const many = <T,>(value: unknown): T[] =>
  value === undefined || value === null ? [] : ((Array.isArray(value) ? value : [value]) as T[]);

const LANG_CSV =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/lang.vromfs.bin_u/lang/units_weaponry.csv";
const LANG_CACHE = path.join(ARMAMENT_DIR, "units_weaponry.csv");

/**
 * The game's own names for its weapons, English column.
 *
 * Rows are keyed `weapons/<file>`, with a `/short` variant beside each — the two
 * forms the loadout menu itself picks between, which is why both are kept rather
 * than prettifying a file name into something the player has never seen.
 */
async function weaponNames(
  useCache: boolean,
): Promise<{ full: Map<string, string>; short: Map<string, string> }> {
  let csv: string;
  if (useCache && existsSync(LANG_CACHE)) {
    csv = await readFile(LANG_CACHE, "utf8");
  } else {
    const response = await fetch(LANG_CSV);
    if (!response.ok) throw new Error(`weapon names: HTTP ${response.status}`);
    csv = await response.text();
    await writeFile(LANG_CACHE, csv, "utf8");
  }

  const full = new Map<string, string>();
  const short = new Map<string, string>();
  for (const line of csv.split("\n")) {
    const match = /^"([^"]+)";"([^"]*)"/.exec(line);
    if (!match) continue;
    const [, key, english] = match;
    if (!key.startsWith("weapons/") || !english) continue;
    const isShort = key.endsWith("/short");
    const file = key.slice("weapons/".length).replace(/\/short$/, "").toLowerCase();
    (isShort ? short : full).set(file, english);
  }
  return { full, short };
}

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
 * Whether a repeat count next to a weapon reference means physical quantity.
 *
 * A flight model's own Weapon entry carries a `bullets` field whichever kind of
 * store it names, but the field means two different things depending on what is
 * on the other end. Pointed at a container — a rack, a rail, a launcher pod —
 * it is how many of that whole unit are hung, verified against the AIM-9 twin
 * rail (2 missiles) and the Zuni LAU-35 (2 pods). Pointed at a gun or a
 * countermeasure dispenser, the same field is its ammunition: every one of the
 * 156 non-container files seen with `bullets` above 1 is a cannon or a flare/
 * chaff launcher, and the number is rounds, not spare gun pods — the BK-27
 * reads `bullets: 150` for a real 150-round magazine on one physical cannon.
 * Bombs referenced directly, never through a container, are never seen with
 * `bullets` above 1 at all, so this affects nothing about how bombs are counted.
 */
export function isPhysicalCount(store: { container: boolean }): boolean {
  return store.container;
}

/**
 * Weighs a store, following a rail or rack to whatever it carries.
 *
 * A third of the stores state no mass of their own because they are not stores at
 * all: `aero_3b_aim9b` is a rail that holds two AIM-9Bs and says so by pointing at
 * the missile's file, which need not be hung anywhere itself.
 *
 * Where a rack does state a weight it is the rack's own, and counts on top of what
 * it carries rather than instead of it — read as the whole story it puts the
 * triple adapter `auf_1_tri_us_gbu_12_x2` at 80 kg while it holds two 277 kg
 * Paveways.
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
  const inner = contained(body);
  if (!inner) return own;
  const innerMass = massOfStore(storeFile(inner.blk), bodies, seen);
  if (innerMass === null) return own;
  return (own ?? 0) + innerMass * inner.count;
}

/**
 * The innermost weapon a store delivers, and how many of it.
 *
 * Racks nest: a pylon adapter holds a rack which holds the bombs. Walking to the
 * bottom is what makes a rack priceable, since only the bomb at the end of the
 * chain appears in the bomb chart.
 */
function innermost(
  file: string,
  bodies: Map<string, Record<string, unknown>>,
  seen = new Set<string>(),
): { file: string; count: number } {
  const body = bodies.get(file);
  const inner = body ? contained(body) : null;
  if (!inner || seen.has(file)) return { file, count: 1 };
  seen.add(file);

  const deeper = innermost(storeFile(inner.blk), bodies, seen);
  return { file: deeper.file, count: deeper.count * inner.count };
}

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(bomb|bombs|mine|torpedo)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");

/**
 * Ties a weapon file to the bomb chart entry that prices it.
 *
 * The chart's name sits at the front of the game's, which finishes the sentence:
 * "250 kg BRP 250" against "250 kg BRP 250 high-drag tail fin retarded bomb". So
 * the test is a prefix, longest first — otherwise "Mk 82" would claim the Mk 82
 * AIR before the AIR entry got a look.
 *
 * A short prefix is not enough to trust: the chart's "BAFG 230" also leads the
 * game's "BA-FG-230-Lizard-2", a different weapon 29 kg heavier. So a short name
 * has to be backed by the weight agreeing, while a long one stands on its own —
 * which it has to, because the two sources weigh retarded bombs differently. The
 * chart gives the SAMP Type 25 200 as 247 kg and the game as 264, the difference
 * being the parachute assembly, and demanding agreement there loses a bomb both
 * sources plainly describe.
 *
 * Nothing is matched on weight alone. Falling back to it tied exactly three
 * stores and got all three wrong, the worst pricing a Mk.13 torpedo as a BGL-1000
 * guided bomb — a weight that happens to be unique in the chart says only that,
 * and the chart is not a complete catalogue of what the game hangs.
 */
/** Normalised characters beyond which a leading match is too specific to be chance. */
const TRUSTED_PREFIX = 10;
function matchBomb(
  store: { file: string; massKg: number | null },
  names: { full: string | null; short: string | null },
  chart: { id: string; chartName: string; fullName: string; massKg: number | null }[],
): string | null {
  const agrees = (bombMass: number | null) =>
    store.massKg === null ||
    bombMass === null ||
    Math.abs(store.massKg - bombMass) <= Math.max(1, store.massKg * 0.02);

  const keyed = chart
    .flatMap((bomb) =>
      [bomb.fullName, bomb.chartName]
        .filter(Boolean)
        .map((name) => ({ bomb, key: normalizeName(name) })),
    )
    .filter((entry) => entry.key.length >= 4)
    .sort((a, b) => b.key.length - a.key.length);

  for (const candidate of [names.full, names.short]) {
    if (!candidate) continue;
    const key = normalizeName(candidate);
    if (!key) continue;
    const hit = keyed.find(
      (entry) =>
        key.startsWith(entry.key) &&
        (entry.key.length >= TRUSTED_PREFIX || agrees(entry.bomb.massKg)),
    );
    if (hit) return hit.bomb.id;
  }

  return null;
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

  const names = await weaponNames(useCache);
  const chart = JSON.parse(
    await readFile(path.join(process.cwd(), "src", "data", "bombs.json"), "utf8"),
  ) as { id: string; chartName: string; fullName: string; massKg: number | null }[];

  const stores: Store[] = [];
  for (const [file, reference] of hung) {
    const body = bodies.get(file);
    if (!body) continue;

    const core = innermost(file, bodies);
    // The directory is what says whether a file is a bomb or a missile, so the
    // core's own reference has to be used rather than a path rebuilt from its name.
    const coreRef = storePath(references.get(core.file) ?? reference);
    const coreBody = bodies.get(core.file) ?? body;
    const coreNames = { full: names.full.get(core.file) ?? null, short: names.short.get(core.file) ?? null };
    const coreMass = massOfStore(core.file, bodies);

    const bombId = ["bomb", "mine", "torpedo", "rocket"].includes(classify(coreRef, coreBody))
      ? matchBomb({ file: core.file, massKg: coreMass }, coreNames, chart)
      : null;

    stores.push({
      file,
      // A rail takes the name of what it holds when it has none of its own.
      name: names.full.get(file) ?? coreNames.full,
      short: names.short.get(file) ?? coreNames.short,
      massKg: massOfStore(file, bodies),
      // ...and is filed under it too, the way the loadout menu lists it.
      kind: classify(coreRef, coreBody),
      bomb: bombId ? { id: bombId, count: core.count } : null,
      holds: core.count,
      container: contained(body) !== null,
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
  console.log(
    `  ${stores.filter((s) => s.container).length} are containers — the only files whose ` +
      `hardpoint repeat count is a physical quantity rather than ammunition`,
  );

  const named = stores.filter((s) => s.name !== null).length;
  const ordnance = stores.filter((s) => ["bomb", "mine", "torpedo"].includes(s.kind));
  const priced = ordnance.filter((s) => s.bomb !== null);
  console.log(`  ${named} carry the game's own name`);
  console.log(
    `  ${priced.length}/${ordnance.length} pieces of ordnance tie to a bomb chart entry`,
  );
  const unpriced = ordnance.filter((s) => s.bomb === null);
  if (unpriced.length > 0) {
    console.log(
      `note  ${unpriced.length} the chart does not price, e.g. ` +
        unpriced.slice(0, 6).map((s) => s.name ?? s.file).join("; "),
    );
  }
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

// `index.ts` imports `isPhysicalCount` from here, and an import must not pull
// the whole catalogue down as a side effect — it would race the payload step
// that reads the result. Only run when this file is the one that was invoked.
if (process.argv[1] && /[\\/]stores\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
