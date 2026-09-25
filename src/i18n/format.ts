import { INTL_LOCALES, type Locale } from "@/i18n/locales";

/**
 * A count that reads differently by number. English needs one and other;
 * Polish and Russian need few and many as well — "2 bazy" but "5 baz",
 * "2 базы" but "5 баз". Which form applies is `Intl.PluralRules`' call.
 */
export type Plural = { one: string; few?: string; many?: string; other: string };

/** Fills `{name}` placeholders; an unknown one is left as written. */
export function fill(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** A number grouped the way the language groups it — 25,900 · 25 900 · 25 900. */
export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  const key = `${locale}:${JSON.stringify(options ?? {})}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(INTL_LOCALES[locale], options);
    numberFormats.set(key, format);
  }
  return format.format(value);
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/** The form of `forms` this count takes, with `{n}` filled by the formatted count. */
export function plural(
  locale: Locale,
  forms: Plural,
  count: number,
  vars: Record<string, string | number> = {},
): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_LOCALES[locale]);
    pluralRules.set(locale, rules);
  }
  const form = rules.select(count) as keyof Plural;
  const template = forms[form] ?? forms.other;
  return fill(template, { n: formatNumber(locale, count), ...vars });
}

/** Dates keep the day-first order the site has always used, English included. */
const DATE_LOCALES: Record<Locale, string> = { en: "en-GB", pl: "pl-PL", ru: "ru-RU" };

/** A day as the language writes it: "24 Sept 2026", "24 wrz 2026", "24 сент. 2026 г.". */
export function formatDay(locale: Locale, day: string): string {
  return new Date(day).toLocaleDateString(DATE_LOCALES[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
