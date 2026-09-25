"use client";

import { createContext, useContext, useMemo } from "react";
import { fill, formatDay, formatNumber, plural, type Plural } from "@/i18n/format";
import { DEFAULT_LOCALE, localePath, type Locale } from "@/i18n/locales";
import type { ClientMessages } from "@/i18n/messages";

type I18n = { locale: Locale; m: ClientMessages };

const I18nContext = createContext<I18n | null>(null);

/**
 * Hands a page's language and its words to every client component under it.
 * Sits in the site shell's layout, which persists across navigation, so the
 * words travel once per full page load rather than once per page.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: ClientMessages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, m: messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The words, the language, and formatters bound to it — the same object for
 * as long as the language is, so its functions are safe in effect and memo
 * dependencies.
 */
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n needs an <I18nProvider> above it");
  const { locale, m } = context;
  return useMemo(
    () => ({
      locale,
      m,
      /** A site path in this language. */
      path: (href: string) => localePath(locale, href),
      number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(locale, value, options),
      count: (forms: Plural, n: number, vars?: Record<string, string | number>) => plural(locale, forms, n, vars),
      day: (date: string) => formatDay(locale, date),
      fill,
      isDefault: locale === DEFAULT_LOCALE,
    }),
    [locale, m],
  );
}
