import type { Locale } from "@/i18n/locales";
import { en } from "@/i18n/messages/en";
import { enServer } from "@/i18n/messages/en.server";
import { pl } from "@/i18n/messages/pl";
import { plServer } from "@/i18n/messages/pl.server";
import { ru } from "@/i18n/messages/ru";
import { ruServer } from "@/i18n/messages/ru.server";

/**
 * The shapes every language fills in — English's own, so a key missing from
 * Polish or Russian (or one they add) is a type error, not a blank on a page.
 *
 * Split in two: the words client components need, which each language ships
 * to the browser as its own script (i18n/words), and the prose only the
 * server renders — page chrome, headings, metadata — which never leaves it.
 */
export type ClientMessages = typeof en;
export type ServerMessages = typeof enServer;
export type Messages = ClientMessages & ServerMessages;

const ALL: Record<Locale, Messages> = {
  en: { ...en, ...enServer },
  pl: { ...pl, ...plServer },
  ru: { ...ru, ...ruServer },
};

/** Every word in a language — for server components and page metadata. */
export function messagesFor(locale: Locale): Messages {
  return ALL[locale];
}
