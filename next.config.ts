import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything is baked at build time, so the whole site ships as static files.
  output: "export",
  // No image server behind a static export, so the renders ship as they are —
  // they are already sized for the tiles they appear in.
  images: { unoptimized: true },
  trailingSlash: true,
  // Set by the deploy workflow to the repo name (e.g. "/wt-bombing-calculator")
  // when GitHub Pages serves this from a project page instead of a custom
  // domain. Unset locally, so `next dev`/`npm run build` stay at the root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
