import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** The game's own UI icon atlas — same source scripts/bomb-icons/config.ts pulls weapon icons from. */
const RAW_BASE =
  "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/atlases.vromfs.bin_u/gameuiskin";

const OUT_DIR = path.join(process.cwd(), "public", "icons");

async function fetchIcon(iconType: string, name: string) {
  const response = await fetch(`${RAW_BASE}/${iconType}.png`);
  if (!response.ok) throw new Error(`Fetching ${iconType}: HTTP ${response.status}`);
  const png = Buffer.from(await response.arrayBuffer());
  await sharp(png).webp({ quality: 95 }).toFile(path.join(OUT_DIR, `${name}.webp`));
  console.log(`Wrote public/icons/${name}.webp`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // The medallion the tech tree pins to the top of a premium vehicle's tile.
  await fetchIcon("talisman", "talisman");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
