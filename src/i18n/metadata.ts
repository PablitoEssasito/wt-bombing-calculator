import type { Metadata } from "next";
import { OG_LOCALES, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { canonicalOf } from "@/lib/site";

/**
 * A language's own site-wide title, description and link preview, for the
 * layout of each prefixed language. The title is absolute, or the root
 * layout's English "%s · WT Bombing Calculator" would wrap it; its template is
 * what that language's own pages get.
 */
export function languageMetadata(locale: Locale): Metadata {
  const { title, shortTitle, description } = messagesFor(locale).site;
  return {
    title: { absolute: title, template: `%s · ${shortTitle}` },
    description,
    ...canonicalOf("/", locale),
    openGraph: { type: "website", siteName: title, title, description, locale: OG_LOCALES[locale] },
    twitter: { card: "summary", title, description },
  };
}
