import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything is baked at build time, so the whole site ships as static files.
  output: "export",
  // No image server behind a static export, so the renders ship as they are —
  // they are already sized for the tiles they appear in.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
