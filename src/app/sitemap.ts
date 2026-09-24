import type { MetadataRoute } from "next";
import { aircraft, meta } from "@/lib/dataset";
import { SITE_URL } from "@/lib/site";

// This site is a static export, which renders a route handler like this one
// at build time rather than per request — Next requires that stated outright.
export const dynamic = "force-static";

/**
 * Every URL the static export actually serves: the four fixed pages and one
 * per aircraft. Well under the 50,000-URL point a sitemap would need
 * splitting at, so one file is all this ever needs.
 *
 * `lastModified` is the ETL's own import timestamp — accurate for every
 * aircraft and bomb-derived page, since none of them can change without a
 * re-import; the fixed pages share it rather than a separate, harder-to-keep
 * true date of their own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(meta.generatedAt);

  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/bombs/`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/changelog/`, lastModified, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/about/`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    ...aircraft.map((plane) => ({
      url: `${SITE_URL}/aircraft/${plane.id}/`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
