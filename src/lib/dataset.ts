import aircraftData from "@/data/aircraft.json";
import aircraftBombIconData from "@/data/aircraft-bomb-icons.json";
import armamentData from "@/data/armament.json";
import battleRatingData from "@/data/battle-ratings.json";
import bombData from "@/data/bombs.json";
import carrierData from "@/data/carriers.json";
import changelogData from "@/data/changelog.json";
import economyData from "@/data/economy.json";
import imageData from "@/data/images.json";
import metaData from "@/data/meta.json";
import mountData from "@/data/mounts.json";
import nameData from "@/data/names.json";
import squadronData from "@/data/squadron.json";
import vehicleTypeData from "@/data/vehicle-types.json";
import { inBombChart } from "@/domain/bomb-chart";
import { NATIONS, type VehicleType } from "@/domain/constants";
import type { Locale } from "@/i18n/locales";
import type { Armament, SlotOption, Store, StoreKind } from "@/domain/loadout";
import rewardConstantsData from "@/data/reward-constants.json";
import { loadoutRewardMul, type AircraftEconomy, type ModeTriple, type RewardConstants } from "@/domain/reward";
import {
  BATTLE_MODES,
  type Aircraft,
  type BattleMode,
  type BattleRatings,
  type Bomb,
  type ChangelogEntry,
  type Meta,
} from "@/domain/types";

export const bombs = bombData as Bomb[];
export const meta = metaData as Meta;
/** What each import changed, newest first — see scripts/changelog. */
export const changelog = changelogData as ChangelogEntry[];

/** Identifies a changelog entry across builds — a patch can have one entry at most, dated once. */
export const changelogKey = (entry: ChangelogEntry) => `${entry.gameVersion ?? ""}|${entry.date}`;

/**
 * The latest entries, cut down to what "what's new" needs on every page: which
 * patch, and which aircraft it touched (so a returning player can be told
 * their favourites changed). Ten is more than anyone stays away for.
 */
export const recentChanges = changelog.slice(0, 10).map((entry) => ({
  key: changelogKey(entry),
  version: entry.gameVersion,
  touched: [
    ...new Set([
      ...entry.aircraft.added.map((a) => a.id),
      ...entry.aircraft.br.map((a) => a.id),
      ...entry.aircraft.loadouts.map((a) => a.id),
    ]),
  ],
}));

/** Aircraft id to the wiki unit whose render illustrates it. */
export const imagesByAircraft = imageData as Record<string, string>;

/**
 * Aircraft the wiki marks a squadron vehicle — earned through a squadron's own
 * activity rather than research or purchase. Premium needs no set of its own:
 * the sheet already states it per aircraft, in `category`.
 */
const squadronIds = new Set(squadronData as string[]);

/** Aircraft id to its battle ratings in every mode — see scripts/battle-ratings. */
const battleRatingsByAircraft = battleRatingData as unknown as Record<string, BattleRatings>;

/** An aircraft's BR per mode; with no game data, the Air RB alone. */
function brsOf(plane: Aircraft): Record<BattleMode, number | null> {
  const ratings = battleRatingsByAircraft[plane.id] ?? { air: [null, plane.br, null], ground: [null, null, null] };
  const [airAb, airRb, airSb] = ratings.air;
  const [groundAb, groundRb, groundSb] = ratings.ground;
  return {
    "air-ab": airAb,
    "air-rb": airRb ?? plane.br,
    "air-sb": airSb,
    "ground-ab": groundAb,
    "ground-rb": groundRb,
    "ground-sb": groundSb,
  };
}

/**
 * What each aircraft earns with, and what each custom-slot weapon counts for
 * towards the bombing reward — see scripts/battle-ratings. Read at build time;
 * a page is handed one aircraft's figures, not the table.
 */
const economy = economyData as unknown as {
  aircraft: Record<string, AircraftEconomy>;
  weaponDamage: Record<string, number>;
};

export const economyFor = (aircraftId: string): AircraftEconomy | null => economy.aircraft[aircraftId] ?? null;

const bombDamage = new Map(bombs.map((b) => [b.id, b.damageValue]));

/**
 * Each loadout's reward multiplier as the game works it out (`loadoutRewardMul`,
 * with the aircraft's class from wpcost.blkx), in place of the sheet's. The
 * sheet's differs on about one loadout in ten, from damage values it predates
 * and 14 aircraft filed under the wrong class: the F-4J's 12 × Mk 82 is 6.6
 * there and 5.6 in the game, which a real battle paid by. The sheet's figure
 * stays where the game's can't be had.
 */
function gameMultiplier(plane: Aircraft, option: Aircraft["options"][number]): number | null {
  const unit = economy.aircraft[plane.id];
  if (!unit || option.rewardMultiplier === null) return option.rewardMultiplier;
  const mul = loadoutRewardMul(option, (id) => bombDamage.get(id), unit, (rewardConstantsData as RewardConstants).bombing);
  return mul === null ? option.rewardMultiplier : Math.round(mul * 100) / 10;
}

export const aircraft: Aircraft[] = (aircraftData as Aircraft[]).map((plane) => ({
  ...plane,
  options: plane.options.map((option) => ({ ...option, rewardMultiplier: gameMultiplier(plane, option) })),
}));

/** Aircraft id to the wiki's own class — fighter, bomber, or strike aircraft. */
const vehicleTypesByAircraft = vehicleTypeData as Record<string, VehicleType>;

/**
 * How each aircraft mounts its ordnance, read off the wiki's suspended armament
 * block: per pylon, or as fixed whole setups.
 *
 * Only "pylons" aircraft can leave part of a load at home. Anything missing here
 * is treated as fixed, so an aircraft we could not read about is never told to do
 * something the game may not allow.
 */
const mountsByAircraft = mountData as Record<string, "pylons" | "setups">;

export const carriesPartialLoad = (aircraftId: string) =>
  mountsByAircraft[aircraftId] === "pylons";

/**
 * The shipped hardpoint data, written short because it is the largest file here.
 *
 * `files` names each store once and everything else points at it by index; a
 * choice hanging one store once is written as a bare index rather than a pair.
 */
type CompactArmament = {
  files: string[];
  stores: {
    n: string | null;
    s: string | null;
    kg: number | null;
    k: string;
    b?: [string, number];
    h?: number;
    i?: string;
  }[];
  units: Record<
    string,
    {
      max: number | null;
      left: number | null;
      right: number | null;
      diff: number | null;
      slots: { i: number; o: { n: string; w: number | [number, number][]; i?: string }[] }[];
      bans: [number, string, number, string][];
      reqs: [number, string, number, string][];
    }
  >;
};

// TypeScript reads the literal shape of a JSON import, which cannot line up with
// the tuples above on its own.
const armamentSource = armamentData as unknown as CompactArmament;

/**
 * What an aircraft can be armed with, expanded for the loadout creator.
 *
 * Read at build time and handed to the page as props, so the browser is given
 * one aircraft's hardpoints rather than all 461. Null for anything that mounts
 * fixed setups instead — there is nothing to build on a Pe-8.
 */
export function armamentFor(aircraftId: string): Armament | null {
  const unit = armamentSource.units[imagesByAircraft[aircraftId] ?? ""];
  if (!unit) return null;

  const storeAt = (index: number): Store => {
    const raw = armamentSource.stores[index];
    return {
      name: raw.n ?? armamentSource.files[index],
      short: raw.s,
      massKg: raw.kg,
      kind: raw.k as StoreKind,
      bomb: raw.b ? { id: raw.b[0], count: raw.b[1] } : null,
      holds: raw.h ?? 1,
      iconType: raw.i ?? null,
      damage: economy.weaponDamage[armamentSource.files[index]] ?? null,
    };
  };

  const optionOf = (option: { n: string; w: number | [number, number][]; i?: string }): SlotOption => ({
    name: option.n,
    stores:
      typeof option.w === "number"
        ? [{ store: storeAt(option.w), count: 1 }]
        : option.w.map(([index, count]) => ({ store: storeAt(index), count })),
    iconType: option.i ?? null,
  });

  return {
    maxLoadKg: unit.max,
    perWingKg: unit.left,
    disbalanceKg: unit.diff,
    hardpoints: unit.slots.map((slot) => ({ index: slot.i, options: slot.o.map(optionOf) })),
    exclusions: unit.bans.map(([slot, option, otherSlot, otherOption]) => ({
      slot,
      option,
      otherSlot,
      otherOption,
    })),
    dependencies: unit.reqs.map(([slot, option, needsSlot, needsOption]) => ({
      slot,
      option,
      needsSlot,
      needsOption,
    })),
  };
}

export { bombIconUrl, bombIconsById, iconUrl, renderUrl } from "./assets";

/**
 * How this aircraft's own loadout menu draws its bombs, where that differs
 * from `bombIconsById` — the game draws one bomb a size apart from one
 * aircraft to the next (see scripts/bomb-icons/aircraft.ts). Handed to the
 * page as props, like `armamentFor`, rather than shipping every aircraft's.
 */
export const bombIconsFor = (aircraftId: string): Record<string, string> =>
  (aircraftBombIconData as Record<string, Record<string, string>>)[aircraftId] ?? {};

export const bombsById: Map<string, Bomb> = new Map(bombs.map((b) => [b.id, b]));

/** The bombs with a page of their own — the bomb chart's rows — for the pages, the sitemap and the palette alike. */
export const pagedBombs: Bomb[] = bombs.filter(inBombChart);

export const aircraftById: Map<string, Aircraft> = new Map(aircraft.map((a) => [a.id, a]));

/** Trimmed down for the client-side search index — the full set is far too big to ship. */
export type AircraftSummary = {
  id: string;
  name: string;
  nation: Aircraft["nation"];
  rank: number;
  br: number;
  /** Its BR in each mode, null where it can't be flown in that mode. */
  brs: Record<BattleMode, number | null>;
  /** Most bases any of its loadouts flattens, which is what people sort by. */
  maxBases: number;
  /** The bulk of what it drops, for the glyph preview on a tile. */
  preview: { bombId: string; count: number } | null;
  /** Wiki unit whose render illustrates it, if one was found. */
  imageId: string | null;
  /** Bought with Golden Eagles rather than researched — the game's gold tiles. */
  premium: boolean;
  /** Earned through a squadron rather than research or purchase — the game's green tiles. */
  squadron: boolean;
  /** The wiki's own class — null for the few rows it never matched to a unit. */
  vehicleType: VehicleType | null;
  /** Its SL multiplier per air mode and its RP multiplier, for sorting; null with no game data. */
  reward: { sl: ModeTriple; rp: number } | null;
};

/** Just enough of a bomb to show it; the full records are far heavier. */
export type BombGlyphData = Pick<Bomb, "id" | "chartName" | "fullName">;

/**
 * The loadouts the overview should describe this aircraft by.
 *
 * Loadouts the source argues against are left out: they are listed first, being
 * the heaviest, so an aircraft like the F-5E would otherwise be advertised by the
 * very payload its note tells you not to take. Aircraft whose every loadout
 * carries that warning keep them, since something has to be shown.
 */
function shownOptions(plane: Aircraft) {
  const sensible = plane.options.filter((option) => !option.discouraged);
  return sensible.length > 0 ? sensible : plane.options;
}

/** The bomb a loadout leans on hardest, by count. */
function headlineBomb(plane: Aircraft): { bombId: string; count: number } | null {
  const schedule = shownOptions(plane)[0]?.schedules[0];
  if (!schedule) return null;

  const totals = new Map<string, number>();
  for (const base of schedule.bases) {
    for (const item of base.items) {
      totals.set(item.bombId, (totals.get(item.bombId) ?? 0) + item.count);
    }
  }
  const top = [...totals].sort((a, b) => b[1] - a[1])[0];
  return top ? { bombId: top[0], count: top[1] } : null;
}

export const aircraftIndex: AircraftSummary[] = aircraft
  .map((plane) => ({
    id: plane.id,
    name: plane.name,
    nation: plane.nation,
    rank: plane.rank,
    br: plane.br,
    brs: brsOf(plane),
    maxBases: Math.max(
      0,
      ...shownOptions(plane).map(
        (o) => o.schedules[0]?.basesDestroyed ?? o.schedules[0]?.bases.length ?? 0,
      ),
    ),
    preview: headlineBomb(plane),
    imageId: imagesByAircraft[plane.id] ?? null,
    premium: plane.category.startsWith("premium"),
    squadron: squadronIds.has(plane.id),
    vehicleType: vehicleTypesByAircraft[plane.id] ?? null,
    reward: economy.aircraft[plane.id]
      ? { sl: economy.aircraft[plane.id].sl, rp: economy.aircraft[plane.id].rp }
      : null,
  }))
  .sort((a, b) => a.br - b.br || a.name.localeCompare(b.name));

/** One aircraft that can carry a given bomb, for that bomb's page. */
export type Carrier = {
  plane: AircraftSummary;
  /** One of the sheet's own loadouts drops it — not merely a hardpoint that could. */
  inSheet: boolean;
};

let carriersByBomb: Map<string, Carrier[]> | null = null;

/**
 * Every aircraft that can carry a bomb, nation by nation and by BR within one.
 *
 * Two sources, as for `usedByNations` (scripts/armament): the sheet's
 * loadouts, and the game's own files — every hardpoint and ready-made setup,
 * which reach everything the sheet never plans a drop with. Worked out once,
 * at build time; no page ships the whole table.
 */
export function aircraftCarrying(bombId: string): Carrier[] {
  if (!carriersByBomb) {
    const sheet = new Map<string, Set<string>>();
    const game = new Map<string, Set<string>>();
    const add = (to: Map<string, Set<string>>, bomb: string, plane: string) => {
      const set = to.get(bomb) ?? new Set<string>();
      set.add(plane);
      to.set(bomb, set);
    };

    for (const plane of aircraft) {
      for (const option of plane.options) {
        for (const schedule of option.schedules) {
          for (const base of schedule.bases) {
            for (const item of base.items) add(sheet, item.bombId, plane.id);
          }
        }
      }
    }

    for (const [bomb, planes] of Object.entries(carrierData as Record<string, string[]>)) {
      for (const plane of planes) add(game, bomb, plane);
    }

    const nationOrder = new Map(NATIONS.map((nation, i) => [nation, i]));
    carriersByBomb = new Map(
      bombs.map((bomb) => {
        const inSheet = sheet.get(bomb.id) ?? new Set<string>();
        const ids = new Set([...inSheet, ...(game.get(bomb.id) ?? [])]);
        const carriers = aircraftIndex
          .filter((plane) => ids.has(plane.id))
          .map((plane) => ({ plane, inSheet: inSheet.has(plane.id) }))
          .sort((a, b) => nationOrder.get(a.plane.nation)! - nationOrder.get(b.plane.nation)!);
        return [bomb.id, carriers];
      }),
    );
  }
  return carriersByBomb.get(bombId) ?? [];
}

/** Every battle rating actually present in each mode, so a slider can snap to real values. */
export const BR_STEPS = Object.fromEntries(
  BATTLE_MODES.map((mode) => [
    mode,
    [...new Set(aircraftIndex.flatMap((a) => a.brs[mode] ?? []))].sort((a, b) => a - b),
  ]),
) as Record<BattleMode, number[]>;

/** Every rank actually present, so a slider can snap to real values. */
export const RANK_STEPS: number[] = [...new Set(aircraft.map((a) => a.rank))].sort((a, b) => a - b);

export const bombGlyphData: BombGlyphData[] = bombs.map((b) => ({
  id: b.id,
  chartName: b.chartName,
  fullName: b.fullName,
}));

/**
 * Aircraft and weapon names in each translated language, as the game's own
 * client shows them — see scripts/localize. Anything missing stays English.
 */
const names = nameData as Record<Exclude<Locale, "en">, { aircraft: Record<string, string>; weapons: Record<string, string> }>;

/** An aircraft's name in a language. */
export function aircraftName(locale: Locale, plane: { id: string; name: string }): string {
  return locale === "en" ? plane.name : (names[locale].aircraft[plane.id] ?? plane.name);
}

/** The aircraft list with its names in a language; order unchanged. */
export function aircraftIndexFor(locale: Locale): AircraftSummary[] {
  if (locale === "en") return aircraftIndex;
  return aircraftIndex.map((plane) => ({ ...plane, name: aircraftName(locale, plane) }));
}

/**
 * English weapon name to the language's, for one aircraft's loadout creator —
 * only the names its hardpoints can hang, not the whole game's, since the map
 * travels with every page. Null in English.
 */
export function weaponNamesFor(locale: Locale, armament: Armament | null): Record<string, string> | null {
  if (locale === "en" || !armament) return null;
  const all = names[locale].weapons;
  const used: Record<string, string> = {};
  for (const hardpoint of armament.hardpoints) {
    for (const option of hardpoint.options) {
      for (const { store } of option.stores) {
        if (all[store.name]) used[store.name] = all[store.name];
      }
    }
  }
  return used;
}
