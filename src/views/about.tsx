import type { Metadata } from "next";
import { Coffee, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageTransition } from "@/components/page-transition";
import { BASE_BLEED, BASE_HP_TIERS, THREE_BASE_HP } from "@/domain/constants";
import { fill, formatNumber, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { meta } from "@/lib/dataset";
import { canonicalOf, KOFI_URL, pageOpenGraph } from "@/lib/site";

export function aboutMetadata(locale: Locale): Metadata {
  const { aboutTitle, aboutDescription } = messagesFor(locale).meta;
  return {
    title: aboutTitle,
    description: aboutDescription,
    ...canonicalOf("/about", locale),
    ...pageOpenGraph(aboutTitle, aboutDescription, undefined, locale),
  };
}

export function AboutView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const a = m.about;
  const sourceLink = (
    <a
      href={meta.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-4 hover:text-accent"
    >
      {m.footer.legion}
    </a>
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-8 leading-relaxed">
        <PageHeader
          icon={Info}
          title={a.title}
          stats={[
            plural(locale, m.stats.aircraft, meta.aircraftCount),
            plural(locale, m.stats.bombs, meta.bombCount),
            ...(meta.sheetVersion ? [fill(m.stats.sheet, { version: meta.sheetVersion })] : []),
          ]}
        >
          <p className="text-ink-dim">{a.intro}</p>
        </PageHeader>

        <a
          href={KOFI_URL}
          target="_blank"
          rel="noreferrer"
          className="card flex items-center gap-3 px-4 py-3.5 border-accent/30 hover:border-accent/60 hover:bg-accent-dim transition-colors"
        >
          <Coffee className="text-accent shrink-0" size={22} />
          <div className="min-w-0">
            <p className="font-medium">{m.nav.coffee}</p>
            <p className="text-sm text-ink-dim">{a.coffeeText}</p>
          </div>
        </a>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.whatsHere}</h2>
          <ul className="text-ink-dim space-y-2 list-disc pl-5">
            {a.features.map((feature) => (
              <li key={feature}>{fill(feature, { aircraft: meta.aircraftCount })}</li>
            ))}
          </ul>
          <p className="text-ink-faint text-sm">
            {a.creditBuilt} {sourceLink}
            {meta.sheetVersion ? ` (v${meta.sheetVersion})` : null}
            {fill(a.creditPulled, { date: new Date(meta.generatedAt).toISOString().slice(0, 10) })}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.howNumbers}</h2>
          <p className="text-ink-dim">{fill(a.bleed, { bleed: BASE_BLEED })}</p>
          <pre className="card px-4 py-3 text-sm overflow-x-auto text-ink-dim">
            <code>{fill(a.formula, { bleed: BASE_BLEED })}</code>
          </pre>
          <p className="text-ink-dim">
            {fill(a.tiers, {
              count: BASE_HP_TIERS.length,
              min: formatNumber(locale, BASE_HP_TIERS[0]),
              max: formatNumber(locale, BASE_HP_TIERS[BASE_HP_TIERS.length - 1]),
              threeMin: formatNumber(locale, THREE_BASE_HP[BASE_HP_TIERS[0]].hp),
              threeMax: formatNumber(locale, THREE_BASE_HP[BASE_HP_TIERS[BASE_HP_TIERS.length - 1]].hp),
            })}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.cannotTell}</h2>
          <ul className="text-ink-dim space-y-2 list-disc pl-5">
            {a.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.renders}</h2>
          <p className="text-ink-dim">{a.rendersText}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.translations}</h2>
          <p className="text-ink-dim">{a.translationsText}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-accent">{a.legal}</h2>
          <p className="text-ink-faint text-sm">{a.legalText}</p>
        </section>
      </div>
    </PageTransition>
  );
}
