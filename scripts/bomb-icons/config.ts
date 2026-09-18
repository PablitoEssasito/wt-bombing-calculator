import path from "node:path";

const REPO = "gszabi99/War-Thunder-Datamine";
const BRANCH = "master";

/**
 * Where every icon this project ships lands, whichever script downloaded it —
 * a bomb's, a rocket's, or (via `scripts/armament/index.ts`) a missile's or a
 * gun's. One directory, one URL scheme (`bombIconUrl` in `src/lib/assets.ts`),
 * regardless of which pipeline put a given file there.
 */
export const OUT_ICONS_DIR = path.join(process.cwd(), "public", "bombs", "icons");

export const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
export const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

/**
 * Where the game's per-weapon definitions live, one .blkx file per weapon.
 *
 * `rocketguns/` holds hundreds of guided missiles alongside the plain unguided
 * rockets bombs.json now carries (see `scripts/etl/rockets.ts`) — the guided
 * ones simply never match anything in the chart, the same way a drop tank in
 * `bombguns/` never would, so there is no need to filter the directory listing.
 */
export const WEAPON_DIRS = ["bombguns", "mines", "rocketguns"] as const;

/** Where the game's UI icon atlas lives — 100x100 transparent PNGs, one per weapon "type". */
export const ICON_DIR = "atlases.vromfs.bin_u/gameuiskin";

export const WEAPONS_PATH = "aces.vromfs.bin_u/gamedata/weapons";
