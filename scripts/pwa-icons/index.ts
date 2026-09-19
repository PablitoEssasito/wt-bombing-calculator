import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * The header's own bomb mark, rasterized at every size the browser tab, iOS
 * home screen and the web manifest each want — same 24x24 grid and colours
 * as the inline SVG `src/app/layout.tsx` draws in the header, and the one
 * `src/app/opengraph-image.tsx` draws for the share card, so all three stay
 * in sync by eye even though nothing enforces it in code.
 *
 * Next can generate a favicon/apple-icon from code too (`icon.tsx`), but
 * under a GitHub Pages basePath its auto-emitted <link> tag ships without
 * the prefix — a plain file referenced through `metadata.icons` composes
 * against `metadataBase` correctly instead, the same way the Open Graph
 * image already does. See `src/app/layout.tsx`.
 */
const OUT_DIR = path.join(process.cwd(), "public", "icons");

function bombSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#0b0f14"/>
  <circle cx="10" cy="15" r="7.2" fill="#ff9f43"/>
  <path d="M14.6 9.4 L18.2 5.8" stroke="#ff9f43" stroke-width="2.3" stroke-linecap="round"/>
  <circle cx="19.2" cy="4.8" r="1.7" fill="#ff9f43"/>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // 32: browser tab. 180: iOS home screen. 192/512: the web manifest.
  for (const size of [32, 180, 192, 512]) {
    const file = path.join(OUT_DIR, `app-icon-${size}.png`);
    await sharp(Buffer.from(bombSvg(size))).png().toFile(file);
    console.log(`Wrote public/icons/app-icon-${size}.png`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
