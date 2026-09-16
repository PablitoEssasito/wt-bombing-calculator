import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { csvUrl } from "./config";

const CACHE_DIR = path.join(process.cwd(), ".cache", "sheet");

/**
 * Downloads a tab as CSV, keeping a copy under .cache/sheet.
 *
 * The cache makes repeat runs offline-capable and lets you diff a fresh pull of
 * the source against the last one before regenerating anything.
 */
export async function fetchTab(gid: string, useCache: boolean): Promise<string> {
  const cachePath = path.join(CACHE_DIR, `${gid}.csv`);

  if (useCache) {
    try {
      return await readFile(cachePath, "utf8");
    } catch {
      // Not cached yet — fall through and download it.
    }
  }

  const response = await fetch(csvUrl(gid));
  if (!response.ok) {
    throw new Error(`Failed to fetch tab ${gid}: HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(`Tab ${gid} returned HTML, not CSV — the sheet may no longer be public`);
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text, "utf8");
  return text;
}
