/**
 * The languages the site is published in. English lives at the site's own
 * addresses, as it always has; the others under their own prefix — /pl/bombs/,
 * /ru/aircraft/…/ — so every existing link keeps working.
 */
export const LOCALES = ["en", "pl", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The languages that get a path prefix. */
export const PREFIXED_LOCALES = ["pl", "ru"] as const satisfies readonly Locale[];

/** Each language named in itself, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", pl: "Polski", ru: "Русский" };

/** What `Intl` formats numbers, dates and plurals with. */
export const INTL_LOCALES: Record<Locale, string> = { en: "en-US", pl: "pl-PL", ru: "ru-RU" };

/** Open Graph's own locale codes. */
export const OG_LOCALES: Record<Locale, string> = { en: "en_US", pl: "pl_PL", ru: "ru_RU" };

/** A site path in the given language: "/bombs/" becomes "/pl/bombs/". */
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}/` : `/${locale}${path}`;
}

/** Splits "/pl/bombs/" into its language and the path it would have in English. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const match = pathname.match(/^\/(pl|ru)(\/.*)?$/);
  if (!match) return { locale: DEFAULT_LOCALE, path: pathname || "/" };
  return { locale: match[1] as Locale, path: match[2] || "/" };
}
