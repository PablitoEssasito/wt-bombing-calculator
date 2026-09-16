import aircraftData from "@/data/aircraft.json";
import bombData from "@/data/bombs.json";
import bombIconData from "@/data/bomb-icons.json";
import imageData from "@/data/images.json";
import metaData from "@/data/meta.json";
import type { Aircraft, Bomb, Meta } from "@/domain/types";

export const aircraft = aircraftData as Aircraft[];
export const bombs = bombData as Bomb[];
export const meta = metaData as Meta;

/** Aircraft id to the wiki unit whose render illustrates it. */
export const imagesByAircraft = imageData as Record<string, string>;

/** Full-size aircraft render, for the vehicle page. Matches the wiki's own art. */
export const renderUrl = (unitId: string) => `/aircraft/renders/${unitId}.webp`;

/** Small tech-tree slot icon, the style the source spreadsheet itself used. */
export const iconUrl = (unitId: string) => `/aircraft/icons/${unitId}.webp`;

/** Bomb id to the game's own UI icon key for it — e.g. "bombs_small", "napalm_middle". */
export const bombIconsById = bombIconData as Record<string, string>;

/** The game's own weapon-selector icon for a bomb, the same art the source sheet uses. */
export const bombIconUrl = (iconType: string) => `/bombs/icons/${iconType}.webp`;

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

/** The bomb a loadout leans on hardest, by count. */
function headlineBomb(plane: Aircraft): { bombId: string; count: number } | null {
  const schedule = plane.options[0]?.schedules[0];
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
      ...plane.options.map(
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
