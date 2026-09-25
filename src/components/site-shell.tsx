import { Coffee } from "lucide-react";
import Link from "next/link";
import { BombMark } from "@/components/bomb-mark";
import { CommandPaletteTrigger } from "@/components/command-palette-trigger";
import { ErrorBoundary } from "@/components/error-boundary";
import { HtmlLang, LanguageDefault, LanguageSelect } from "@/components/language";
import { ChangelogDot, WhatsNewToast } from "@/components/whats-new";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";

import { meta, recentChanges } from "@/lib/dataset";
import { KOFI_URL } from "@/lib/site";

/**
 * Everything around a page — header, footer, and the page's language for
 * every client component inside. One per language, from the (en), pl and ru
 * layouts; the root layout under all three only holds what no language changes.
 */
export function SiteShell({
  locale,
  Words,
  children,
}: {
  locale: Locale;
  /**
   * The client-side words provider for this language (i18n/words), passed in
   * by the layout rather than imported here: each layout importing only its
   * own keeps every language's words in a script of their own, instead of all
   * three riding along in one shared one.
   */
  Words: React.ComponentType<{ children: React.ReactNode }>;
  children: React.ReactNode;
}) {
  const m = messagesFor(locale);
  const nav = [
    { href: "/", label: m.nav.aircraft, short: null },
    { href: "/bombs/", label: m.nav.bombs, short: m.nav.bombsShort },
    { href: "/changelog/", label: m.nav.changelog, short: m.nav.changelogShort },
    { href: "/about/", label: m.nav.about, short: m.nav.aboutShort },
  ];
  // `short` is the phone label; null leaves the link off a phone's header
  // altogether — Aircraft is the home page, which the logo already links to.

  return (
    <Words>
      <HtmlLang />
      <header
        lang={locale}
        className="border-b border-line sticky top-0 z-30 bg-ground/85 backdrop-blur"
        style={{ viewTransitionName: "site-header" }}
      >
        <div className="mx-auto max-w-6xl px-3 min-[360px]:px-4 h-14 flex items-center gap-1.5 md:gap-6">
          <Link
            href={localePath(locale, "/")}
            transitionTypes={["nav-fade"]}
            className="flex items-center gap-1.5 md:gap-2 shrink-0"
          >
            <BombMark size={30} className="text-accent shrink-0" />
            <span className="hidden lg:inline font-semibold text-lg tracking-tight whitespace-nowrap">
              Bombing<span className="text-ink-dim">Calc</span>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 md:gap-1 text-sm min-w-0">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={localePath(locale, item.href)}
                transitionTypes={["nav-fade"]}
                className={`px-1 min-[360px]:px-1.5 md:px-3 py-1.5 rounded-md text-ink-dim hover:text-ink hover:bg-surface-2 transition-colors whitespace-nowrap ${item.short ? "" : "hidden md:block"}`}
              >
                {item.short ? <span className="md:hidden">{item.short}</span> : null}
                <span className="hidden md:inline">{item.label}</span>
                {item.href === "/changelog/" ? <ChangelogDot latestKey={recentChanges[0]?.key ?? null} /> : null}
              </Link>
            ))}
          </nav>
          <CommandPaletteTrigger />
          <LanguageSelect />
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-2 min-[360px]:px-2.5 lg:px-3 py-1.5 rounded-md text-accent border border-accent/30 hover:bg-accent-dim hover:border-accent/60 transition motion-safe:active:scale-[0.97] whitespace-nowrap shrink-0 text-sm font-medium"
          >
            <Coffee size={16} className="shrink-0" aria-hidden />
            <span className="hidden lg:inline">{m.nav.coffee}</span>
            <span className="sr-only lg:hidden">{m.nav.coffee}</span>
          </a>
        </div>
      </header>

      <main lang={locale} className="flex-1">
        <ErrorBoundary heading={m.error.heading} text={m.error.text}>
          {children}
        </ErrorBoundary>
      </main>

      <footer lang={locale} className="border-t border-line mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-faint space-y-2">
          <p>
            {m.footer.builtFrom}
            <br /> {m.footer.handTuned}{" "}
            <a
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-dim underline underline-offset-4 hover:text-accent"
            >
              {m.footer.legion}
            </a>
            {meta.sheetVersion ? ` (v${meta.sheetVersion})` : null}.
          </p>
          <p>
            {m.footer.notAffiliated} {m.footer.lastUpdate}{" "}
            {new Date(meta.generatedAt).toISOString().slice(0, 10)}.
          </p>
        </div>
      </footer>

      <WhatsNewToast changes={recentChanges} />
      <LanguageDefault />
    </Words>
  );
}
