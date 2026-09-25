import type { Metadata } from "next";
import { AircraftSearch } from "@/components/aircraft-search";
import { PageTransition } from "@/components/page-transition";
import { QuickAccess } from "@/components/quick-access";
import { fill } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/locales";
import { messagesFor } from "@/i18n/messages";
import { BR_STEPS, RANK_STEPS, aircraftIndexFor, bombGlyphData, meta } from "@/lib/dataset";
import { canonicalOf, SITE_URL } from "@/lib/site";

/**
 * The home page's own metadata is only its address: the title and
 * description are the site's, set by the layout above it.
 */
export function homeMetadata(locale: Locale): Metadata {
  return canonicalOf("/", locale);
}

export function HomeView({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const index = aircraftIndexFor(locale);

  // Tells Google what kind of thing this page is beyond its plain title and
  // description — a free web app, not an article or a store listing. Only the
  // entry page carries it; a copy on every aircraft page would just be noise
  // repeating the same site-level facts 648 times.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: m.site.title,
    url: `${SITE_URL}${localePath(locale, "/")}`,
    description: m.site.description,
    inLanguage: locale,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 space-y-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-balance">{m.home.heading}</h1>
          <p className="text-ink-dim max-w-2xl text-pretty">
            {m.home.intro}
            <br /> {fill(m.home.covers, { aircraft: meta.aircraftCount, bombs: meta.bombCount })}
          </p>
        </header>

        <QuickAccess index={index} />

        <div className="enter" style={{ "--i": 1 } as React.CSSProperties}>
          <AircraftSearch index={index} brSteps={BR_STEPS} rankSteps={RANK_STEPS} bombs={bombGlyphData} />
        </div>

        <section className="enter grid gap-4 sm:grid-cols-3 text-sm" style={{ "--i": 2 } as React.CSSProperties}>
          {m.home.facts.map((fact) => (
            <Fact key={fact.title} title={fact.title}>
              {fact.text}
            </Fact>
          ))}
        </section>
      </div>
    </PageTransition>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-1.5">
      <h2 className="font-medium text-accent">{title}</h2>
      <p className="text-ink-dim leading-relaxed">{children}</p>
    </div>
  );
}
