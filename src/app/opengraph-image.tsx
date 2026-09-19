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
        <div
          style={{
            width: 64,
            height: 64,
            background: "#ff9f43",
            transform: "rotate(45deg)",
            marginBottom: 40,
          }}
        />
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
