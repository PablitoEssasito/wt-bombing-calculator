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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b0f14"/>
  <g transform="rotate(-40 32 32)">
    <g transform="translate(32 32) scale(0.86) translate(-32 -32)" fill="#ff9f43">
      <polygon points="27,10.5 11.5,4.5 11,10 26.5,16"/>
      <polygon points="26.4,17.8 10.9,11.8 10.3,17.3 25.8,23.3"/>
      <polygon points="37,10.5 52.5,4.5 53,10 37.5,16"/>
      <polygon points="37.6,17.8 53.1,11.8 53.7,17.3 38.2,23.3"/>
      <polygon points="28.6,14 29.2,8.5 34.8,8.5 35.4,14"/>
      <polygon points="26.4,13.4 24.4,18.6 39.6,18.6 37.6,13.4"/>
      <polygon points="24.1,20.8 23.2,22.5 21.8,26 20.7,30 19.9,34 19.3,38 19,42 19.15,45.6 44.85,45.6 45,42 44.7,38 44.1,34 43.3,30 42.2,26 40.8,22.5 39.9,20.8"/>
      <polygon points="19.5,47.8 20.7,50.8 43.3,50.8 44.5,47.8"/>
      <polygon points="21,53 22.4,55 24.2,57 26.5,58.5 29.2,59.6 32,60 34.8,59.6 37.5,58.5 39.8,57 41.6,55 43,53"/>
    </g>
  </g>
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
