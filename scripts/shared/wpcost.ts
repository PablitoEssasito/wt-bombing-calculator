import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UnitCost } from "../battle-ratings/parse";

/**
 * The game's own price list, `char.vromfs.bin_u/config/wpcost.blkx`, cut down to
 * what this project reads from it — the full file is 32 MB.
 *
 * Two scripts read it: `battle-ratings` for every aircraft's BR and economy, and
 * `armament/stores` for the weapons themselves. A weapon is keyed
 * `<kind>_<file>` (`bombguns_su_ofab250`, `containers_ter_ar_inc_220`) and
 * priced the same on every aircraft that hangs it, so each one is kept once,
 * with the aircraft that carry it.
 */
export const DATAMINE_CONFIG =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/char.vromfs.bin_u/config";

const CACHE = path.join(process.cwd(), ".cache", "wpcost-slim.json");
/** Bumped whenever the cached shape changes, so a stale cache is pulled again. */
const VERSION = 6;

export type WpcostWeapon = {
  /**
   * What the hangar shows as "Estimated damage to bases" (`getWeaponDamage`,
   * gui/globals/econweaponutils.nut) — the whole store, rack included. Absent
   * for what the game prices at nothing: guns, fuel, every guided missile.
   */
  weaponDamage?: number;
  isWeaponForCustomSlot?: boolean;
  /** The store's ordnance mass as the game totals it for the preset tooltip. */
  mass?: number;
  /** How many rounds the store holds. */
  count?: number;
  /** A nuclear store's yield, in kilotons. */
  nuclearYield?: number;
  /**
   * What the game files a guided store as, for the weapon selector's filters:
   * an air-to-air missile, an air-to-ground one, or a guided bomb.
   */
  role?: "aam" | "agm" | "guidedBomb";
  /** Every aircraft that can carry it, through a custom slot or a fixed preset. */
  units: string[];
};

export type Wpcost = {
  version: number;
  units: Record<string, UnitCost>;
  weapons: Record<string, WpcostWeapon>;
  /**
   * Aircraft with a fixed setup the price list prices but does not break
   * down — an older kind of entry, with no `sum_weapons` — so what it hangs
   * is only in the aircraft's own flight model.
   */
  unlisted: string[];
  /**
   * What the price list prices each aircraft's fixed setups at, by setup name
   * — the price of a bomb it prices nowhere on its own: the Pe-8's one FAB-5000
   * is priced only as `pe-8_fab5000`.
   */
  presets: Record<string, Record<string, number>>;
};

const UNIT_FIELDS = [
  "rewardMulArcade",
  "rewardMulHistorical",
  "rewardMulSimulation",
  "expMul",
  "costGold",
  "premPackAir",
  "unitClass",
  "rank",
  "country",
  "unitMoveType",
];

/** The prefixes the game files a weapon under, the directory its file lives in. */
export const WEAPON_PREFIXES = ["bombguns", "rocketguns", "containers", "torpedoes", "mines"] as const;

/** Ordnance a hardpoint hangs — not a drop tank, a targeting pod or the aircraft's own guns. */
const isStore = (key: string) => WEAPON_PREFIXES.some((prefix) => key.startsWith(`${prefix}_`));

export async function fetchConfig(file: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${DATAMINE_CONFIG}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

type RawWeapon = {
  weaponDamage?: number;
  isWeaponForCustomSlot?: boolean;
  totalBombRocketMass?: number;
  totalGuidedBombMass?: number;
  totalNapalmBombMass?: number;
  totalTorpedoMass?: number;
  totalBombCount?: number;
  totalNuclearYield?: number;
  aamGuidanceType?: unknown;
  atgmVisibilityType?: unknown;
  guidedBombVisibilityType?: unknown;
  sum_weapons?: Record<string, number>;
};

/** How long a pulled price list is reused without being asked to: one import's worth. */
const FRESH_MS = 60 * 60 * 1000;

/**
 * Reads the price list — from the cache when asked to, or when it was pulled
 * within the hour: an import runs three scripts that read it, and one pull of
 * 32 MB serves them all.
 */
export async function loadWpcost(useCache: boolean): Promise<Wpcost> {
  if (existsSync(CACHE) && (useCache || Date.now() - (await stat(CACHE)).mtimeMs < FRESH_MS)) {
    const cached = JSON.parse(await readFile(CACHE, "utf8")) as Partial<Wpcost>;
    if (cached.version === VERSION) return cached as Wpcost;
  }

  const all = await fetchConfig("wpcost.blkx");
  const units: Record<string, UnitCost> = {};
  const weapons: Record<string, WpcostWeapon> = {};
  const unlisted = new Set<string>();
  const presets: Record<string, Record<string, number>> = {};
  const carriedBy = (key: string, unit: string) => {
    const weapon = (weapons[key] ??= { units: [] });
    if (!weapon.units.includes(unit)) weapon.units.push(unit);
    return weapon;
  };

  for (const [unit, value] of Object.entries(all)) {
    if (typeof value !== "object" || value === null) continue;
    const fields = Object.entries(value).filter(
      ([key]) => key.startsWith("economicRank") || UNIT_FIELDS.includes(key),
    );
    if (fields.some(([key]) => key.startsWith("economicRank"))) units[unit] = Object.fromEntries(fields);
    const isAir = (value as { unitMoveType?: string }).unitMoveType === "air";

    for (const [key, raw] of Object.entries((value as { weapons?: Record<string, RawWeapon> }).weapons ?? {})) {
      if (typeof raw !== "object" || raw === null) continue;
      if (isAir && !isStore(key) && typeof raw.weaponDamage === "number" && raw.weaponDamage > 0) {
        (presets[unit] ??= {})[key] = raw.weaponDamage;
      }
      // A fixed preset lists what it hangs; a custom-slot weapon is its own entry.
      if (raw.sum_weapons) {
        if (isAir) for (const inner of Object.keys(raw.sum_weapons)) if (isStore(inner)) carriedBy(inner, unit);
        continue;
      }
      if (!isStore(key)) {
        if (isAir && typeof raw.weaponDamage === "number" && raw.weaponDamage > 0) unlisted.add(unit);
        continue;
      }
      const weapon = isAir ? carriedBy(key, unit) : (weapons[key] ??= { units: [] });
      if (typeof raw.weaponDamage === "number") weapon.weaponDamage = raw.weaponDamage;
      if (raw.isWeaponForCustomSlot) weapon.isWeaponForCustomSlot = true;
      const mass = raw.totalBombRocketMass ?? raw.totalGuidedBombMass ?? raw.totalNapalmBombMass ?? raw.totalTorpedoMass;
      if (typeof mass === "number") weapon.mass = mass;
      if (typeof raw.totalBombCount === "number") weapon.count = raw.totalBombCount;
      if (typeof raw.totalNuclearYield === "number") weapon.nuclearYield = raw.totalNuclearYield;
      if (raw.aamGuidanceType !== undefined) weapon.role = "aam";
      else if (raw.atgmVisibilityType !== undefined) weapon.role = "agm";
      else if (raw.guidedBombVisibilityType !== undefined) weapon.role = "guidedBomb";
    }
  }
  for (const weapon of Object.values(weapons)) weapon.units.sort();

  const slim: Wpcost = { version: VERSION, units, weapons, unlisted: [...unlisted].sort(), presets };
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(slim));
  return slim;
}
