import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dragOf } from "../armament/stats";
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

type Json = Record<string, unknown>;

/**
 * What a weapon's file says about its icon, read the way the armament import
 * reads a round: high drag by `dragOf`, fire by the `fireDamage` block — the
 * ZAB's "sks" filling names no fire, yet it burns.
 */
export function defOf(relativePath: string, json: Json): WeaponDef {
  const payload = (json.bomb ?? json.rocket ?? {}) as Json;
  return {
    path: relativePath,
    iconType: (json.iconType as string) ?? (payload.iconType as string) ?? null,
    massKg: typeof payload.mass === "number" ? payload.mass : null,
    isMine: relativePath.startsWith("mines/"),
    isRocket: relativePath.startsWith("rocketguns/"),
    isGuided: payload.guidance != null,
    isDrag: dragOf(payload),
    isIncendiary: payload.fireDamage != null,
  };
}

/**
 * The part of a weapon's file `defOf` reads, kept as the file has it: the
 * cache holds what the game says, not what was made of it, so a change to a
 * rule needs no fetch.
 */
function trimmed(text: string): Json | null {
  let json: Json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const key = json.bomb != null ? "bomb" : json.rocket != null ? "rocket" : null;
  const payload = (key ? json[key] : {}) as Json;
  const kept: Json = {};
  for (const field of ["iconType", "mass", "brakeArm", "brakeCxK", "guidance", "fireDamage"]) {
    // Only whether a block is there matters, not what is in it.
    if (payload[field] != null) kept[field] = typeof payload[field] === "object" ? {} : payload[field];
  }
  return { iconType: json.iconType, ...(key ? { [key]: kept } : {}) };
}

/**
 * Fetches every bomb, mine and (named) rocket definition from the datamine.
 *
 * Concurrency is capped well below GitHub's abuse-detection thresholds — this
 * pulls on the order of 500 small files, not thousands, so there is no need to
 * push it.
 */
export async function fetchWeaponDefs(useCache: boolean): Promise<WeaponDef[]> {
  const cachePath = path.join(CACHE_DIR, "files.json");
  const defsOf = (files: { path: string; json: Json }[]) => files.map((file) => defOf(file.path, file.json));

  if (useCache && existsSync(cachePath)) {
    return defsOf(JSON.parse(await readFile(cachePath, "utf8")));
  }

  const dirLists = await Promise.all(WEAPON_DIRS.map((dir) => listDir(dir)));
  const allPaths = dirLists.flat();

  const files: { path: string; json: Json }[] = [];
  const queue = [...allPaths];
  const CONCURRENCY = 20;

  async function worker() {
    while (queue.length > 0) {
      const relativePath = queue.shift();
      if (!relativePath) break;
      const text = await fetchRaw(relativePath);
      if (!text) continue;
      const json = trimmed(text);
      if (json) files.push({ path: relativePath, json });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // In path order, so a cache written by one run reads the same as another's.
  files.sort((a, b) => a.path.localeCompare(b.path));
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(files));
  return defsOf(files);
}

/** Downloads one icon from the game's own UI atlas, as-is (no resizing needed — it's 100x100 already). */
export async function fetchIconPng(iconType: string): Promise<Buffer | null> {
  const response = await fetch(`${RAW_BASE}/${ICON_DIR}/${iconType}.png`);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/** What the atlas was found to have or lack, by icon name — so a run from the cache asks none of it again. */
const ATLAS_CACHE = path.join(CACHE_DIR, "atlas.json");

let atlas: Record<string, boolean> | null = null;

/** Whether the game's UI atlas has an icon by this name — already pulled, or there to pull. */
export async function iconExists(iconType: string, useCache: boolean): Promise<boolean> {
  if (existsSync(path.join(OUT_ICONS_DIR, `${iconType}.webp`))) return true;
  atlas ??= existsSync(ATLAS_CACHE) ? (JSON.parse(await readFile(ATLAS_CACHE, "utf8")) as Record<string, boolean>) : {};
  if (useCache && iconType in atlas) return atlas[iconType];
  const response = await fetch(`${RAW_BASE}/${ICON_DIR}/${iconType}.png`, { method: "HEAD" });
  // Only a plain yes or no is remembered: a rate limit or a server error is
  // not the atlas lacking the icon.
  if (response.ok || response.status === 404) {
    atlas[iconType] = response.ok;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(ATLAS_CACHE, JSON.stringify(atlas));
  }
  return response.ok;
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
