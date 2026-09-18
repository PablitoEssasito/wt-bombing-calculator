import bombIconData from "@/data/bomb-icons.json";

/**
 * Where the images live, and the one small lookup needed to pick a bomb's icon.
 *
 * Kept apart from the dataset on purpose. Anything importing that module gets the
 * whole spreadsheet with it — every aircraft, every drop schedule — because it
 * builds its indexes at module scope. The components that draw a tile only need a
 * path and an icon name, and they run in the browser, so pulling half a megabyte
 * of loadout tables along for the ride would be a poor trade.
 */

/** Full-size aircraft render, for the vehicle page. Matches the wiki's own art. */
export const renderUrl = (unitId: string) => `/aircraft/renders/${unitId}.webp`;

/** Small tech-tree slot icon, the style the source spreadsheet itself used. */
export const iconUrl = (unitId: string) => `/aircraft/icons/${unitId}.webp`;

/** Bomb id to the game's own UI icon key for it — e.g. "bombs_small", "napalm_middle". */
export const bombIconsById = bombIconData as Record<string, string>;

/** The game's own weapon-selector icon for a bomb, the same art the source sheet uses. */
export const bombIconUrl = (iconType: string) => `/bombs/icons/${iconType}.webp`;

/** The tech tree's own medallion for a premium vehicle — see scripts/reward-icons. */
export const TALISMAN_ICON_URL = "/icons/talisman.webp";

/** The game's own squad leader HUD marker, repurposed for a squadron vehicle's tile. */
export const SQUAD_LEADER_ICON_URL = "/icons/squad-leader.webp";
