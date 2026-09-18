import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// This site is a static export, which renders a route handler like this one
// at build time rather than per request — Next requires that stated outright.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
