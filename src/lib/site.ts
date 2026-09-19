import { BASE_PATH } from "./base-path";

/**
 * The full URL this site is served from, base path and all — e.g.
 * `https://pablitoessasito.github.io/wt-bombing-calculator` on GitHub Pages,
 * where the repo has no custom domain of its own.
 *
 * The sitemap, robots.txt and every Open Graph tag need an absolute URL, which
 * a relative path cannot give them. Set `NEXT_PUBLIC_SITE_URL` before building
 * for production — the localhost fallback is only ever right for `next dev`,
 * and shipping it by accident would point search engines and link previews at
 * a machine they cannot reach. `NEXT_PUBLIC_SITE_URL` itself is origin-only;
 * `BASE_PATH` is appended here so every caller gets one already-correct value.
 */
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "") + BASE_PATH;

/**
 * The card every page falls back to when it has nothing more specific of its
 * own — generated at build time by app/opengraph-image.tsx. That file only
 * reaches a page for free when the page sets no metadata at all, which the
 * home page is the only one that doesn't (see the "Merging" note below), so
 * every other caller of `pageOpenGraph` gets it explicitly instead.
 */
const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "War Thunder Base Bombing Calculator",
};

/**
 * The `openGraph`/`twitter` pair a page needs to carry its own title and
 * description into a link preview.
 *
 * Next merges `Metadata` one key at a time rather than deep-merging nested
 * objects (see the "Merging" section of its `generateMetadata` docs), so the
 * root layout's `openGraph`/`twitter` never reaches a page that sets its
 * own — every page with something more specific to say has to restate the
 * whole shape, which is what this saves it from doing by hand.
 */
export function pageOpenGraph(
  title: string,
  description: string,
  image: { url: string; width: number; height: number; alt: string } = DEFAULT_OG_IMAGE,
) {
  return {
    openGraph: {
      type: "website" as const,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [image.url],
    },
  };
}

/**
 * The one true URL for a page, trailing slash and all — the same shape
 * `next.config.ts`'s `trailingSlash` makes every link on the site use, and
 * the one `sitemap.ts` lists. Stating it keeps a search engine from treating
 * `/bombs` and `/bombs/` as two different pages that happen to agree.
 */
export function canonicalOf(pathname: string) {
  const path = pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
  return { alternates: { canonical: `${SITE_URL}${path}` } };
}
