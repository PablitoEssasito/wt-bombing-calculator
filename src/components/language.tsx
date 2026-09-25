"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { DEFAULT_LOCALE, LOCALE_NAMES, LOCALES, localePath, splitLocale, type Locale } from "@/i18n/locales";

const CHOSEN_KEY = "wtbc:lang";

function remember(locale: Locale) {
  try {
    localStorage.setItem(CHOSEN_KEY, locale);
  } catch {
    // Storage denied — the choice just isn't remembered.
  }
}

function chosen(): string | null {
  try {
    return localStorage.getItem(CHOSEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Moves to the same page in another language, query string and all, and
 * remembers the choice so the first-visit default never overrides it.
 */
export function useSwitchLanguage() {
  const pathname = usePathname();
  const router = useRouter();
  return (locale: Locale, { replace = false } = {}) => {
    remember(locale);
    const target = localePath(locale, splitLocale(pathname).path) + window.location.search;
    if (replace) router.replace(target);
    else router.push(target, { transitionTypes: ["nav-fade"] });
  };
}

/**
 * Keeps `<html lang>` on the page's language. The root layout is shared by
 * every language, so it can only state English; this corrects it on arrival
 * and after every move between languages.
 */
export function HtmlLang() {
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}

/**
 * The header's language picker — on a phone just the language code, and not
 * at all below 390 px, where the header has no room and the palette offers it
 * instead. Shows only the language code, to fit the header; the
 * native select laid over it opens the full list, and is what the keyboard and
 * a screen reader actually operate.
 */
export function LanguageSelect() {
  const { locale, m } = useI18n();
  const switchTo = useSwitchLanguage();
  return (
    <label className="relative hidden min-[390px]:flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 md:px-2 py-1.5 text-sm text-ink-dim transition-colors hover:border-line-bright hover:text-ink focus-within:border-accent">
      <Languages size={15} aria-hidden className="hidden md:block" />
      <span aria-hidden className="uppercase">
        {locale}
      </span>
      <select
        value={locale}
        aria-label={m.nav.language}
        onChange={(event) => switchTo(event.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l} className="bg-surface text-ink">
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The first of the browser's own languages the site speaks, if any. */
function browserLocale(): Locale | null {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(code)) return code as Locale;
  }
  return null;
}

/**
 * The language a first visit lands in, decided once and remembered:
 *
 * - a browser set to Polish or Russian moves to that version of the page;
 * - one set to English stays;
 * - one set to none of the three is asked, in a small dialog;
 * - arriving on a Polish or Russian address keeps it — someone followed a
 *   link in that language on purpose.
 *
 * Only ever in the browser, after the page has rendered: a search engine
 * crawling the English addresses always gets English.
 */
export function LanguageDefault() {
  const { locale, m } = useI18n();
  const switchTo = useSwitchLanguage();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (chosen()) return;
    if (locale !== DEFAULT_LOCALE) {
      remember(locale);
      return;
    }
    const preferred = browserLocale();
    if (preferred === DEFAULT_LOCALE) remember(DEFAULT_LOCALE);
    else if (preferred) switchTo(preferred, { replace: true });
    else dialog.current?.showModal();
    // Once per page load: the decision only ever needs making on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (l: Locale) => {
    dialog.current?.close();
    if (l === locale) remember(l);
    else switchTo(l);
  };

  return (
    <dialog
      ref={dialog}
      // Closing it any other way (Escape) is a choice too: stay in English.
      onClose={() => {
        if (!chosen()) remember(DEFAULT_LOCALE);
      }}
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line-bright bg-surface p-5 text-ink backdrop:bg-black/60"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Languages size={18} className="text-accent" aria-hidden />
        {m.nav.chooseLanguage}
      </h2>
      <p className="mt-1 text-sm text-ink-dim">{m.nav.chooseLanguageHint}</p>
      <div className="mt-4 grid gap-2">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={l}
            onClick={() => pick(l)}
            className="card flex items-center justify-between px-4 py-2.5 text-left hover:border-accent/60 hover:bg-accent-dim transition-colors"
          >
            {LOCALE_NAMES[l]}
            <span className="text-xs uppercase text-ink-faint">{l}</span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
