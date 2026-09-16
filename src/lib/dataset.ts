import aircraftData from "@/data/aircraft.json";
import bombData from "@/data/bombs.json";
import imageData from "@/data/images.json";
import metaData from "@/data/meta.json";
import mountData from "@/data/mounts.json";
import type { Aircraft, Bomb, Meta } from "@/domain/types";

export const aircraft = aircraftData as Aircraft[];
export const bombs = bombData as Bomb[];
export const meta = metaData as Meta;

/** Aircraft id to the wiki unit whose render illustrates it. */
export const imagesByAircraft = imageData as Record<string, string>;

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
  }))
  .sort((a, b) => a.br - b.br || a.name.localeCompare(b.name));

/** Every battle rating actually present, so a slider can snap to real values. */
export const BR_STEPS: number[] = [...new Set(aircraft.map((a) => a.br))].sort((a, b) => a - b);

export const bombGlyphData: BombGlyphData[] = bombs.map((b) => ({
  id: b.id,
  chartName: b.chartName,
  fullName: b.fullName,
}));
