import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { API_BASE, ICON_DIR, OUT_ICONS_DIR, RAW_BASE, WEAPON_DIRS, WEAPONS_PATH } from "./config";
import type { WeaponDef } from "./match";

const CACHE_DIR = path.join(process.cwd(), ".cache", "weapon-defs");

async function listDir(dir: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/${WEAPONS_PATH}/${dir}`);
  if (!response.ok) throw new Error(`Listing ${dir}: HTTP ${response.status}`);
  const entries = (await response.json()) as { name: string }[];
  return entries.map((e) => `${dir}/${e.name}`);
}

async function fetchRaw(relativePath: string): Promise<string | null> {
  const response = await fetch(`${RAW_BASE}/${WEAPONS_PATH}/${relativePath}`);
  return response.ok ? response.text() : null;
}

/** Pulls the handful of fields we need out of a weapon's raw game-data file. */
function parseDef(relativePath: string, text: string): WeaponDef | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const payload = (json.bomb ?? json.rocket ?? {}) as Record<string, unknown>;
  const iconType = (json.iconType as string) ?? (payload.iconType as string) ?? null;
  const massKg = typeof payload.mass === "number" ? payload.mass : null;

  return {
    path: relativePath,
    iconType,
    massKg,
    isMine: relativePath.startsWith("mines/"),
    isRocket: relativePath.startsWith("rocketguns/"),
    isGuided: payload.guidance != null,
    isDrag: payload.brakeArm != null || payload.brakeCxK != null,
    isIncendiary: /napalm|incendiary|aerea/i.test(String(payload.explosiveType ?? "")),
  };
}

/**
 * Fetches every bomb, mine and (named) rocket definition from the datamine.
 *
 * Concurrency is capped well below GitHub's abuse-detection thresholds — this
 * pulls on the order of 500 small files, not thousands, so there is no need to
 * push it.
 */
export async function fetchWeaponDefs(useCache: boolean): Promise<WeaponDef[]> {
  const cachePath = path.join(CACHE_DIR, "defs.json");

  if (useCache && existsSync(cachePath)) {
    return JSON.parse(await readFile(cachePath, "utf8")) as WeaponDef[];
  }

  const dirLists = await Promise.all(WEAPON_DIRS.map((dir) => listDir(dir)));
  const allPaths = dirLists.flat();

  const defs: WeaponDef[] = [];
  const queue = [...allPaths];
  const CONCURRENCY = 20;

  async function worker() {
    while (queue.length > 0) {
      const relativePath = queue.shift();
      if (!relativePath) break;
      const text = await fetchRaw(relativePath);
      if (!text) continue;
      const def = parseDef(relativePath, text);
      if (def) defs.push(def);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(defs));
  return defs;
}

/** Downloads one icon from the game's own UI atlas, as-is (no resizing needed — it's 100x100 already). */
export async function fetchIconPng(iconType: string): Promise<Buffer | null> {
  const response = await fetch(`${RAW_BASE}/${ICON_DIR}/${iconType}.png`);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Pulls whichever of these icon keys are not already sitting in `OUT_ICONS_DIR`
 * and writes them there as webp. Shared by every script that discovers icon
 * keys of its own — the bomb chart's own match, and the armament catalogue's
 * direct read of a missile's or a gun's `iconType` — so a key already fetched
 * for one is never pulled a second time for the other.
 */
export async function downloadIcons(iconTypes: string[]): Promise<{ downloaded: number; failed: string[] }> {
  await mkdir(OUT_ICONS_DIR, { recursive: true });
  const failed: string[] = [];
  let downloaded = 0;
  for (const iconType of iconTypes) {
    const file = path.join(OUT_ICONS_DIR, `${iconType}.webp`);
    if (existsSync(file)) continue;
    const png = await fetchIconPng(iconType);
    if (!png) {
      failed.push(iconType);
      continue;
    }
    await sharp(png).webp({ quality: 95 }).toFile(file);
    downloaded++;
  }
  return { downloaded, failed };
}
