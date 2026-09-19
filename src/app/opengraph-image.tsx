import { ImageResponse } from "next/og";

// Route Handlers need this stated explicitly under `output: export` — see
// sitemap.ts/robots.ts, which hit the same build error without it.
export const dynamic = "force-static";

export const alt = "War Thunder Base Bombing Calculator";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link-preview card for every page that doesn't set its own — an
 * aircraft page overrides this with its own render (see its generateMetadata),
 * so this only ever shows up for the home, bombs and about pages.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f14",
          fontFamily: "sans-serif",
        }}
      >
        {/* Same mark as src/components/bomb-mark.tsx and scripts/pwa-icons, scaled up. */}
        <svg viewBox="0 0 24 24" width={90} height={90} style={{ marginBottom: 28 }}>
          <rect x="10.5" y="1" width="3" height="7" rx="1.5" fill="#ff9f43" />
          <polygon points="8,8 2,12 8,13" fill="#ff9f43" />
          <polygon points="16,8 22,12 16,13" fill="#ff9f43" />
          <circle cx="12" cy="8" r="4" fill="#ff9f43" />
          <polygon points="8,8 16,8 13.5,19 12,21 10.5,19" fill="#ff9f43" />
        </svg>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 600, color: "#e8eef6" }}>
          <span>Bombing</span>
          <span style={{ color: "#9fb0c4" }}>Calc</span>
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#9fb0c4" }}>
          How many bombs to take, and what to drop on each base
        </div>
      </div>
    ),
    { ...size },
  );
}
