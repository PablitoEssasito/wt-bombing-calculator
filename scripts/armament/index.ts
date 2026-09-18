import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Aircraft, Bomb } from "../../src/domain/types";
import { downloadIcons } from "../bomb-icons/fetch";
import { parseArmament, presetPath, type Armament } from "./parse";
import { isPhysicalCount } from "./stores";

const RAW =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/aces.vromfs.bin_u/gamedata";

const DATA_DIR = path.join(process.cwd(), "src", "data");
/** Shipped: the one field the app reads at runtime. */
const OUT_MOUNTS = path.join(DATA_DIR, "mounts.json");
/**
 * The game's own files, kept as they came.
 *
 * Caching the parse instead was a false economy: every correction to the parser
 * meant pulling six hundred files again, which is exactly when you least want to.
 */
const RAW_DIR = path.join(process.cwd(), ".cache", "armament", "raw");
/** Reference material for auditing, deliberately out of the bundle. */
const OUT_FULL = path.join(process.cwd(), ".cache", "armament", "armament.json");
/** The store catalogue `npm run stores` builds, which this joins against. */
const STORES_FILE = path.join(process.cwd(), ".cache", "armament", "stores.json");
/** Shipped: what the loadout creator reads, one aircraft at a time. */
const OUT_ARMAMENT = path.join(DATA_DIR, "armament.json");

type StoreRecord = {
  file: string;
  name: string | null;
  short: string | null;
  massKg: number | null;
  kind: string;
  bomb: { id: string; count: number } | null;
  holds: number;
  iconType: string | null;
  container: boolean;
};

const CONCURRENCY = 8;

const useCache = process.argv.includes("--cache");

type UnitFiles = { fm: Record<string, unknown>; presets: Record<string, Record<string, unknown>> };

async function getJson(relativePath: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${RAW}/${relativePath}`);
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadUnit(unitId: string): Promise<UnitFiles | null> {
  const cachePath = path.join(RAW_DIR, `${unitId}.json`);
  if (useCache && existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, "utf8")) as UnitFiles;
  }

  const fm = await getJson(`flightmodels/${unitId}.blkx`);
  if (!fm) return null;

  // Each preset's composition lives in its own small file beside the flight model.
  const references = (fm.weapon_presets as { preset?: unknown } | undefined)?.preset;
  const list = (Array.isArray(references) ? references : references ? [references] : []) as {
    name: string;
    blk: string;
  }[];

  const presets: Record<string, Record<string, unknown>> = {};
  await Promise.all(
    list.map(async (entry) => {
      const body = await getJson(presetPath(entry.blk));
      if (body) presets[String(entry.name)] = body;
    }),
  );

  const files: UnitFiles = { fm, presets };
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(files), "utf8");
  return files;
}

async function main() {
  const aircraft = JSON.parse(
    await readFile(path.join(DATA_DIR, "aircraft.json"), "utf8"),
  ) as Aircraft[];
  const unitIds = JSON.parse(
    await readFile(path.join(DATA_DIR, "images.json"), "utf8"),
  ) as Record<string, string>;

  const wanted = [...new Set(aircraft.map((p) => unitIds[p.id]).filter(Boolean))];
  console.log(
    useCache
      ? `Reading ${wanted.length} flight models, cached where already pulled`
      : `Pulling ${wanted.length} flight models from the datamine`,
  );

  const byUnit: Record<string, Armament> = {};
  const missing: string[] = [];
  const queue = [...wanted];
  let done = 0;

  async function worker() {
    for (let unitId = queue.shift(); unitId; unitId = queue.shift()) {
      const files = await loadUnit(unitId);
      if (files) {
        byUnit[unitId] = parseArmament(files.fm, new Map(Object.entries(files.presets)));
      } else {
        missing.push(unitId);
      }
      if (++done % 100 === 0) console.log(`  ${done}/${wanted.length} read...`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const mounts: Record<string, "pylons" | "setups"> = {};
  for (const plane of aircraft) {
    const armament = byUnit[unitIds[plane.id]];
    if (armament) mounts[plane.id] = armament.style;
  }

  await mkdir(path.dirname(OUT_FULL), { recursive: true });
  await writeFile(OUT_FULL, JSON.stringify(byUnit), "utf8");
  await writeFile(OUT_MOUNTS, JSON.stringify(mounts), "utf8");

  const bombs = JSON.parse(await readFile(path.join(DATA_DIR, "bombs.json"), "utf8")) as Bomb[];
  await writePayload(byUnit);
  const catalogue = JSON.parse(await readFile(STORES_FILE, "utf8")) as StoreRecord[];
  report(aircraft, unitIds, byUnit, missing, bombs, catalogue);

  // Every icon a missile, a gun or anything else states directly — the bomb
  // chart's own icons come from a separate match in scripts/bomb-icons, keyed
  // by bomb id rather than icon type, so this only ever pulls what that step
  // would not already have. Presets first: a preset's own iconType is what the
  // loadout menu actually draws (see SlotOption.iconType in parse.ts), so its
  // key needs fetching even where the store catalogue's own key already exists.
  const presetIconTypes = Object.values(byUnit).flatMap((a) =>
    a.slots.flatMap((s) => s.options.flatMap((o) => (o.iconType ? [o.iconType] : []))),
  );
  const iconTypes = [
    ...new Set([...presetIconTypes, ...catalogue.flatMap((s) => (s.iconType ? [s.iconType] : []))]),
  ].sort();
  console.log(`\nDownloading ${iconTypes.length} distinct icons the armament catalogue names directly...`);
  const { downloaded, failed } = await downloadIcons(iconTypes);
  console.log(`Icons ready (${downloaded} newly downloaded, ${failed.length} failed)`);
  if (failed.length > 0) console.log(`  ${failed.slice(0, 10).join(", ")}`);
}

/**
 * Writes what the loadout creator needs, for the aircraft that can use it.
 *
 * Only aircraft with hardpoints get an entry — there is nothing to build on a
 * Pe-8. It ships as one file but is never handed to the browser whole: the
 * aircraft page picks out its own unit and passes that slice down as props.
 *
 * Stores are listed once in `files` and referred to by index everywhere else.
 * Twenty-three thousand hardpoint options naming `us_500lb_anm64a1` in full is
 * most of a megabyte spent writing the same eighteen characters over and over.
 */
async function writePayload(byUnit: Record<string, Armament>) {
  const catalogue = JSON.parse(await readFile(STORES_FILE, "utf8")) as StoreRecord[];
  const byFile = new Map(catalogue.map((s) => [s.file, s]));

  const files: string[] = [];
  const indexOf = new Map<string, number>();
  const intern = (file: string) => {
    const known = indexOf.get(file);
    if (known !== undefined) return known;
    indexOf.set(file, files.length);
    files.push(file);
    return files.length - 1;
  };

  /**
   * How many of a store a hardpoint choice actually hangs.
   *
   * The game states this two ways and only one of them is safe to read without
   * knowing what is on the other end. Separate mounting points are always a
   * physical count — a Tu-95M's bomb bay is six entries of one FAB-250 each. The
   * `bullets` field beside a reference is a physical count only on a rack or a
   * rail, and ammunition on anything else, which is why a BK-27 states 150 of
   * itself. So repeats are counted for ordinary stores, and `bullets` is taken
   * only where a container is doing the holding.
   */
  let ammoIgnored = 0;
  const countOf = (store: { file: string; entries: number; bullets: number }): number => {
    const known = byFile.get(store.file);
    if (known && isPhysicalCount(known)) return store.bullets;
    if (store.bullets > store.entries) ammoIgnored++;
    return store.entries;
  };

  // Intern every store up front, sorted, so the file reads the same on every
  // run — the flight models arrive in whatever order the fetch finished, and
  // interning on first sight made each regeneration a spurious 1.3 MB diff.
  const referenced = new Set<string>();
  for (const armament of Object.values(byUnit)) {
    if (armament.style !== "pylons") continue;
    for (const slot of armament.slots) {
      for (const option of slot.options) {
        if (option.hidden) continue;
        for (const store of option.stores) referenced.add(store.file);
      }
    }
  }
  for (const file of [...referenced].sort()) intern(file);

  const units: Record<string, unknown> = {};
  const unitsInOrder = Object.entries(byUnit).sort(([a], [b]) => a.localeCompare(b));
  for (const [unitId, armament] of unitsInOrder) {
    if (armament.style !== "pylons") continue;

    // A dependency rule is only useful if both ends name a choice this aircraft
    // actually offers — 5.5% do not, being copy-paste in the source (see the
    // audit above), and there is nothing to warn about pointing at nothing.
    const offered = new Map(armament.slots.map((s) => [s.index, new Set(s.options.map((o) => o.name))]));
    const resolves = (slot: number, preset: string) => offered.get(slot)?.has(preset) ?? false;
    const requires = armament.requires.filter(
      (r) => resolves(r.slot, r.preset) && resolves(r.otherSlot, r.otherPreset),
    );

    units[unitId] = {
      max: armament.maxLoadKg,
      left: armament.maxLeftKg,
      right: armament.maxRightKg,
      diff: armament.maxDisbalanceKg,
      slots: armament.slots.map((slot) => ({
        i: slot.index,
        o: slot.options
          .filter((option) => !option.hidden)
          .map((option) => {
            const resolved = option.stores.map((store) => ({
              file: store.file,
              count: countOf(store),
            }));
            return {
              n: option.name,
              // One store carried once is the ordinary case, and writes as a bare index.
              w:
                resolved.length === 1 && resolved[0].count === 1
                  ? intern(resolved[0].file)
                  : resolved.map((store) => [intern(store.file), store.count]),
              // The preset's own icon, when it states one — see SlotOption.iconType
              // in scripts/armament/parse.ts for why this outranks a store's own.
              ...(option.iconType ? { i: option.iconType } : {}),
            };
          }),
      })),
      bans: armament.bans.map((r) => [r.slot, r.preset, r.otherSlot, r.otherPreset]),
      reqs: requires.map((r) => [r.slot, r.preset, r.otherSlot, r.otherPreset]),
    };
  }

  const stores = files.map((file) => {
    const store = byFile.get(file);
    if (!store) return { n: file, s: null, kg: null, k: "other" };
    return {
      n: store.name,
      s: store.short,
      // The game's own figures carry float noise; nothing needs it to the microgram.
      kg: store.massKg === null ? null : Math.round(store.massKg * 100) / 100,
      k: store.kind,
      ...(store.bomb ? { b: [store.bomb.id, store.bomb.count] } : {}),
      // One round is the ordinary case and is left implicit.
      ...(store.holds > 1 ? { h: store.holds } : {}),
      ...(store.iconType ? { i: store.iconType } : {}),
    };
  });

  const payload = { files, stores, units };
  await writeFile(OUT_ARMAMENT, JSON.stringify(payload), "utf8");
  console.log(
    `      wrote ${Object.keys(units).length} buildable aircraft and ${files.length} stores ` +
      `to src/data/armament.json (${Math.round(Buffer.byteLength(JSON.stringify(payload)) / 1024)} KB)`,
  );
  if (ammoIgnored > 0) {
    console.log(
      `      ignored an ammunition figure on ${ammoIgnored} hardpoint choice(s) — a cannon's ` +
        `magazine, not that many gun pods`,
    );
  }
  namedCounts(units, stores);
}

function report(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  missing: string[],
  bombs: Bomb[],
  catalogue: StoreRecord[],
) {
  const units = Object.values(byUnit);
  const read = aircraft.filter((p) => byUnit[unitIds[p.id]]).length;
  const pylons = units.filter((u) => u.style === "pylons").length;
  const sum = (pick: (u: Armament) => number) => units.reduce((n, u) => n + pick(u), 0);

  console.log(`\n--- armament ---`);
  console.log(`ok    ${read}/${aircraft.length} aircraft, from ${units.length} distinct units`);
  console.log(`      ${pylons} mount per pylon, ${units.length - pylons} offer fixed setups only`);
  console.log(`      ${sum((u) => u.presets.length)} ready-made loadouts`);
  console.log(
    `      ${sum((u) => u.bans.length)} exclusion and ${sum((u) => u.requires.length)} ` +
      `dependency rule(s)`,
  );

  const lopsided = units.filter(
    (u) => u.maxLeftKg !== null && u.maxLeftKg !== u.maxRightKg,
  ).length;
  console.log(`      ${lopsided} state different limits for the left and right wing`);

  const hidden = sum((u) => u.slots.reduce((n, s) => n + s.options.filter((o) => o.hidden).length, 0));
  console.log(`      ${hidden} hardpoint choice(s) the loadout menu does not show`);

  audit(byUnit);
  auditPresets(byUnit, catalogue);
  weighLoadouts(aircraft, unitIds, byUnit, bombs);

  if (missing.length > 0) {
    console.log(`warn  ${missing.length} unit(s) had no flight model: ${missing.slice(0, 6).join(", ")}`);
  }
  const unmatched = aircraft.filter((p) => !unitIds[p.id]).map((p) => p.name);
  if (unmatched.length > 0) {
    console.log(`warn  ${unmatched.length} aircraft have no unit to look up: ${unmatched.join(", ")}`);
  }
}

/**
 * Weighs each loadout the spreadsheet prescribes against what the airframe lifts.
 *
 * This is the one place two independent sources describe the same thing: the
 * sheet says how many of each bomb to hang, and the game's own files say what
 * each bomb weighs and how much the aircraft may carry. A loadout heavier than
 * the limit is not a loadout anyone can take, whatever the sheet says — with
 * the caveat `auditPresets` prints: four of the game's own presets sit over
 * their airframe's figure too, so the ceiling is not quite the hard wall it
 * looks like.
 *
 * Bomb masses agree with the game's to the gram, which is why the tolerance here
 * is small: it exists for rounding in the sheet's own figures, where twelve
 * FAB-100s come to 1,248 kg against a 1,245 kg limit.
 */
function weighLoadouts(
  aircraft: Aircraft[],
  unitIds: Record<string, string>,
  byUnit: Record<string, Armament>,
  bombs: Bomb[],
) {
  const TOLERANCE = 1.01;
  const massOf = new Map(bombs.map((b) => [b.id, b.massKg]));

  let checked = 0;
  const over: { plane: Aircraft; option: number; mass: number; limit: number }[] = [];

  for (const plane of aircraft) {
    const limit = byUnit[unitIds[plane.id]]?.maxLoadKg;
    if (!limit) continue;

    plane.options.forEach((option, index) => {
      let heaviest = 0;
      for (const schedule of option.schedules) {
        let mass = 0;
        for (const base of schedule.bases) {
          for (const item of base.items) {
            const kg = massOf.get(item.bombId);
            // Rockets carry no mass in the sheet, so the total would understate.
            if (kg === null || kg === undefined) return;
            mass += kg * item.count;
          }
        }
        heaviest = Math.max(heaviest, mass);
      }
      if (heaviest === 0) return;
      checked++;
      if (heaviest > limit * TOLERANCE) {
        over.push({ plane, option: index + 1, mass: heaviest, limit });
      }
    });
  }

  console.log(
    `${over.length === 0 ? "ok   " : "warn "} ${over.length}/${checked} loadout(s) weigh more ` +
      "than the aircraft can carry:",
  );
  for (const o of over.sort((a, b) => b.mass / b.limit - a.mass / a.limit)) {
    console.log(
      `        ${o.plane.nation}/${o.plane.name} loadout ${o.option}: ${Math.round(o.mass)} kg ` +
        `against a ${o.limit} kg limit (${Math.round((100 * o.mass) / o.limit)}%)`,
    );
  }
}

/**
 * Cross-checks how many a choice hangs against what its own name says.
 *
 * The game names a good half of its hardpoint choices after the count —
 * `fab_250_x6`, `mer_mk82_x6` — which is an independent statement of the same
 * fact and so worth reading back. A rack is named for the munitions it holds
 * rather than for itself, so the comparison is against what the choice
 * delivers, not how many objects hang off the pylon.
 *
 * The handful left over are genuinely ambiguous rather than wrong: options that
 * come in `_left_x2`/`_right_x2` pairs, where the two may well be the pair
 * across both wings rather than two on this one. Nothing in the files settles
 * it, so they are reported rather than guessed at.
 */
function namedCounts(
  units: Record<string, unknown>,
  stores: { k: string; b?: (string | number)[] }[],
) {
  type Unit = { slots: { i: number; o: { n: string; w: number | [number, number][] }[] }[] };
  let checked = 0;
  let agreed = 0;
  const unsettled: string[] = [];

  for (const [unitId, unit] of Object.entries(units as Record<string, Unit>)) {
    for (const slot of unit.slots) {
      for (const option of slot.o) {
        const stated = /_x(\d+)\b/.exec(option.n);
        if (!stated) continue;
        checked++;

        const pairs = typeof option.w === "number" ? [[option.w, 1] as const] : option.w;
        // A bomb rack is named for what it holds, so read through to the
        // munitions. A rocket pod is named per launcher — "zuni_x2" is two
        // LAU-10s, eight rockets — so there the pods themselves are the count.
        const perLauncher = stores[pairs[0][0]]?.k === "rocket";
        const delivered = pairs.reduce((n, [index, count]) => {
          const held = stores[index]?.b?.[1];
          return n + count * (!perLauncher && typeof held === "number" ? held : 1);
        }, 0);

        if (delivered === Number(stated[1])) agreed++;
        else if (delivered < Number(stated[1]) && stores[pairs[0][0]]?.k === "bomb") {
          unsettled.push(`${unitId} slot ${slot.i} "${option.n}" carries ${delivered}`);
        }
      }
    }
  }

  console.log(
    `      ${agreed}/${checked} choice(s) named after a count carry exactly that many; ` +
      `${unsettled.length} state one where the name says more`,
  );
  for (const one of unsettled.slice(0, 4)) console.log(`        ${one}`);
}

/**
 * Checks the hardpoint rules against the hardpoints they talk about.
 *
 * These files are hand-maintained per aircraft and the per-slot presets are
 * plainly copied between slots, so references drift: a preset still named for
 * slot 4 sitting on slot 6 and depending on itself, or a dependency naming
 * "gun_pod" where the slot actually offers "gun_pod_slot3". None of it is ours to
 * fix, but a consumer that trusts a reference to resolve needs to know how often
 * it does not.
 */
/**
 * Holds the game's own ready-made loadouts up against the two rules the creator
 * hard-blocks on — the mass limit and the exclusion rules — since both come
 * from the same flight model that lists the presets.
 *
 * A preset the game itself offers must be buildable; where it is not, either
 * the game does not enforce the rule the way the creator does, or the file
 * contradicts itself (the Tornado GR.4 lists a Mk 82 loadout that its own
 * BannedWeaponPreset on slot 7 rules out). Either way it is worth a look
 * before trusting the block.
 */
function auditPresets(byUnit: Record<string, Armament>, catalogue: StoreRecord[]) {
  const massByFile = new Map(catalogue.map((s) => [s.file, s.massKg ?? 0]));
  const clashes = (
    rule: Armament["bans"][number],
    a: { slot: number; opt: string },
    b: { slot: number; opt: string },
  ) =>
    (rule.slot === a.slot && rule.preset === a.opt && rule.otherSlot === b.slot && rule.otherPreset === b.opt) ||
    (rule.slot === b.slot && rule.preset === b.opt && rule.otherSlot === a.slot && rule.otherPreset === a.opt);

  let checked = 0;
  const overweight: string[] = [];
  const excluded: string[] = [];

  for (const [unitId, armament] of Object.entries(byUnit)) {
    if (armament.style !== "pylons") continue;

    const offers = new Map<string, number[]>();
    const massOf = new Map<string, number>();
    for (const slot of armament.slots) {
      for (const option of slot.options) {
        offers.set(option.name, [...(offers.get(option.name) ?? []), slot.index]);
        const kg = option.stores.reduce((n, s) => n + (massByFile.get(s.file) ?? 0) * s.entries, 0);
        massOf.set(option.name, Math.max(massOf.get(option.name) ?? 0, kg));
      }
    }

    for (const preset of armament.presets) {
      const need = preset.weapons.map((w) => ({ opt: w.weapon, n: w.count, slots: offers.get(w.weapon) ?? [] }));
      if (need.some((x) => x.slots.length < x.n)) continue;
      checked++;

      const kg = preset.weapons.reduce((n, w) => n + (massOf.get(w.weapon) ?? 0) * w.count, 0);
      if (armament.maxLoadKg !== null && kg > armament.maxLoadKg * 1.01) {
        overweight.push(`${unitId} ${preset.name}: ${Math.round(kg)} kg against ${armament.maxLoadKg}`);
      }

      // A weapon name can be offered on several slots; the preset is fine if
      // any placement of it clears the rules.
      const picks: { slot: number; opt: string }[] = [];
      const used = new Set<number>();
      const clean = () =>
        picks.every((a, i) => picks.slice(i + 1).every((b) => !armament.bans.some((r) => clashes(r, a, b))));
      const place = (i: number, k: number): boolean => {
        if (i === need.length) return clean();
        if (k === need[i].n) return place(i + 1, 0);
        for (const slot of need[i].slots) {
          if (used.has(slot)) continue;
          used.add(slot);
          picks.push({ slot, opt: need[i].opt });
          const ok = place(i, k + 1);
          picks.pop();
          used.delete(slot);
          if (ok) return true;
        }
        return false;
      };
      if (!place(0, 0)) excluded.push(`${unitId} ${preset.name}`);
    }
  }

  const tag = (list: string[]) => (list.length === 0 ? "ok   " : "warn ");
  console.log(
    `${tag(overweight)} game presets: ${overweight.length}/${checked} exceed the airframe's own mass limit`,
  );
  for (const one of overweight.slice(0, 6)) console.log(`        ${one}`);
  console.log(
    `${tag(excluded)} game presets: ${excluded.length}/${checked} would be blocked by the exclusion rules as read`,
  );
  for (const one of excluded.slice(0, 6)) console.log(`        ${one}`);
}

function audit(byUnit: Record<string, Armament>) {
  const units = Object.entries(byUnit);
  let bansTotal = 0;
  let bansBroken = 0;
  let mutual = 0;
  let requiresTotal = 0;
  let requiresBroken = 0;

  for (const [, armament] of units) {
    const offered = new Map(armament.slots.map((s) => [s.index, new Set(s.options.map((o) => o.name))]));
    const resolves = (slot: number, preset: string) => offered.get(slot)?.has(preset) ?? false;

    const stated = new Set(
      armament.bans.map((b) => `${b.slot}|${b.preset}>${b.otherSlot}|${b.otherPreset}`),
    );
    for (const ban of armament.bans) {
      bansTotal++;
      if (!resolves(ban.slot, ban.preset) || !resolves(ban.otherSlot, ban.otherPreset)) bansBroken++;
      if (stated.has(`${ban.otherSlot}|${ban.otherPreset}>${ban.slot}|${ban.preset}`)) mutual++;
    }

    for (const rule of armament.requires) {
      requiresTotal++;
      if (!resolves(rule.slot, rule.preset) || !resolves(rule.otherSlot, rule.otherPreset)) {
        requiresBroken++;
      }
    }
  }

  const pct = (n: number, of: number) => (of === 0 ? "0" : ((100 * n) / of).toFixed(1));
  console.log(
    `${bansBroken === 0 ? "ok   " : "warn "} exclusion rules: ${bansBroken}/${bansTotal} ` +
      `reference something the aircraft does not offer`,
  );
  console.log(
    `note  ${pct(mutual, bansTotal)}% of exclusions are written from both sides; the rest are ` +
      "stated once and have to be read as mutual",
  );
  console.log(
    `${requiresBroken === 0 ? "ok   " : "note "} dependency rules: ${requiresBroken}/${requiresTotal} ` +
      `(${pct(requiresBroken, requiresTotal)}%) do not resolve — copy-paste in the source`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
