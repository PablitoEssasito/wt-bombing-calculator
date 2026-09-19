import type { MetadataRoute } from "next";
import { BASE_PATH, withBasePath } from "@/lib/base-path";

// Route Handlers need this stated explicitly under `output: export` — see
// sitemap.ts/robots.ts, which hit the same build error without it.
export const dynamic = "force-static";

/**
 * Lets a phone add this as a home-screen icon — exactly the "opened mid-match
 * loading screen" use case the rest of the site is designed around, minus
 * the browser chrome around it once launched that way.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "War Thunder Base Bombing Calculator",
    short_name: "BombingCalc",
    description:
      "How many bombs to take, and what to drop on each base, for every bomber and attacker in War Thunder.",
    start_url: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    icons: [
      { src: withBasePath("/icons/app-icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBasePath("/icons/app-icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
