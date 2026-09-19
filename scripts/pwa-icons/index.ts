import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * The header's own ◆ mark, rasterized at every size the browser tab, iOS
 * home screen and the web manifest each want.
 *
 * Next can generate a favicon/apple-icon from code too (`icon.tsx`), but
 * under a GitHub Pages basePath its auto-emitted <link> tag ships without
 * the prefix — a plain file referenced through `metadata.icons` composes
 * against `metadataBase` correctly instead, the same way the Open Graph
 * image already does. See `src/app/layout.tsx`.
 */
const OUT_DIR = path.join(process.cwd(), "public", "icons");

function diamondSvg(size: number): string {
  const side = Math.round(size * 0.53);
  const half = side / 2;
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0b0f14"/>
  <rect x="${c - half}" y="${c - half}" width="${side}" height="${side}" fill="#ff9f43" transform="rotate(45 ${c} ${c})"/>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // 32: browser tab. 180: iOS home screen. 192/512: the web manifest.
  for (const size of [32, 180, 192, 512]) {
    const file = path.join(OUT_DIR, `app-icon-${size}.png`);
    await sharp(Buffer.from(diamondSvg(size))).png().toFile(file);
    console.log(`Wrote public/icons/app-icon-${size}.png`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
