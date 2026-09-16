const REPO = "gszabi99/War-Thunder-Datamine";
const BRANCH = "master";

export const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
export const API_BASE = `https://api.github.com/repos/${REPO}/contents`;

/** Where the game's per-weapon definitions live, one .blkx file per weapon. */
export const WEAPON_DIRS = ["bombguns", "mines"] as const;

/** Where the game's UI icon atlas lives — 100x100 transparent PNGs, one per weapon "type". */
export const ICON_DIR = "atlases.vromfs.bin_u/gameuiskin";

export const WEAPONS_PATH = "aces.vromfs.bin_u/gamedata/weapons";

/**
 * Rocket files fetched individually rather than by listing a directory.
 *
 * `rocketguns/` holds hundreds of guided missiles alongside a handful of plain
 * unguided rockets, and the sheet only ever names five of the latter — so it is
 * simpler and faster to name the exact files than to filter the whole directory.
 * Each is the plain base variant; the sheet does not distinguish sub-marks.
 */
export const ROCKET_FILES = [
  "rocketguns/us_5_in_hvar.blkx",
  "rocketguns/us_zuni_wafar_mk32.blkx",
  "rocketguns/us_2_75_in_ffar_mighty_mouse.blkx",
  "rocketguns/uk_rp3.blkx",
  "rocketguns/su_m8.blkx",
] as const;
