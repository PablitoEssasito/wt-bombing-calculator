import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/locales";
import { aircraft, meta } from "@/lib/dataset";
import { languageUrls } from "@/lib/site";

// This site is a static export, which renders a route handler like this one
// at build time rather than per request — Next requires that stated outright.
export const dynamic = "force-static";

/**
 * Every URL the static export actually serves: the four fixed pages and one
 * per aircraft, in each language, each entry naming its counterparts in the
 * others (hreflang). Well under the 50,000-URL point a sitemap would need
 * splitting at, so one file is all this ever needs.
 *
 * `lastModified` is the ETL's own import timestamp — accurate for every
 * aircraft and bomb-derived page, since none of them can change without a
 * re-import; the fixed pages share it rather than a separate, harder-to-keep
 * true date of their own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(meta.generatedAt);
  const pages: { path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/bombs/", changeFrequency: "monthly", priority: 0.6 },
    { path: "/changelog/", changeFrequency: "weekly", priority: 0.4 },
    { path: "/about/", changeFrequency: "yearly", priority: 0.3 },
    ...aircraft.map((plane) => ({
      path: `/aircraft/${plane.id}/`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return pages.flatMap(({ path, changeFrequency, priority }) => {
    const urls = languageUrls(path);
    const languages = Object.fromEntries(LOCALES.map((locale) => [locale, urls[locale]]));
    return LOCALES.map((locale) => ({
      url: urls[locale],
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
