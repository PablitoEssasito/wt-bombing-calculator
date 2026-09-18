import aircraftData from "@/data/aircraft.json";
import armamentData from "@/data/armament.json";
import bombData from "@/data/bombs.json";
import imageData from "@/data/images.json";
import metaData from "@/data/meta.json";
import mountData from "@/data/mounts.json";
import squadronData from "@/data/squadron.json";
import type { Armament, SlotOption, Store, StoreKind } from "@/domain/loadout";
import type { Aircraft, Bomb, Meta } from "@/domain/types";

export const aircraft = aircraftData as Aircraft[];
export const bombs = bombData as Bomb[];
export const meta = metaData as Meta;

/** Aircraft id to the wiki unit whose render illustrates it. */
export const imagesByAircraft = imageData as Record<string, string>;

/**
 * Aircraft the wiki marks a squadron vehicle — earned through a squadron's own
 * activity rather than research or purchase. Premium needs no set of its own:
 * the sheet already states it per aircraft, in `category`.
 */
const squadronIds = new Set(squadronData as string[]);

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

export const bombsById: Map<string, Bomb> = new Map(bombs.map((b) => [b.id, b]));

export const aircraftById: Map<string, Aircraft> = new Map(aircraft.map((a) => [a.id, a]));

/** Trimmed down for the client-side search index — the full set is far too big to ship. */
export type AircraftSummary = {
  id: string;
  name: string;
  nation: Aircraft["nation"];
  rank: number;
  br: number;
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
  }))
  .sort((a, b) => a.br - b.br || a.name.localeCompare(b.name));

/** Every battle rating actually present, so a slider can snap to real values. */
export const BR_STEPS: number[] = [...new Set(aircraft.map((a) => a.br))].sort((a, b) => a - b);

export const bombGlyphData: BombGlyphData[] = bombs.map((b) => ({
  id: b.id,
  chartName: b.chartName,
  fullName: b.fullName,
}));
